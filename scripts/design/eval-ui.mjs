// Evals de interface em navegador real (docs/design-refactor/04-evals.md, EVAL-UI-*).
// Precisa do app web rodando e do pacote `playwright`. Playwright NÃO é dependência do repositório
// (decisão P-03 pendente), então instale fora do projeto uma vez:
//   mkdir -p ~/.fw-evals && cd ~/.fw-evals && npm i playwright@1 && npx playwright install chromium
// e rode a partir da raiz do repositório:
//   NODE_PATH=~/.fw-evals/node_modules node scripts/design/eval-ui.mjs
//
// Variáveis:
//   FW_BASE_URL    padrão http://localhost:3100
//   FW_SESSION     valor do cookie fw_session de um usuário de teste (habilita rotas logadas)
//   FW_SEARCH_ID   id de uma busca existente (habilita /search/:id)
//   FW_WATCH_ID    id de um monitoramento do usuário de teste (habilita /watches/:id)
//   FW_CHROMIUM    caminho de um Chromium já instalado (opcional)
//   FW_TZ          fuso do navegador, padrão America/Sao_Paulo. Servidor em UTC e navegador no
//                  Brasil é o caso real: data formatada sem timeZone fixo quebra a hidratação.
// Uso: node scripts/design/eval-ui.mjs [--json saida.json]
import fs from 'node:fs';
import { createRequire } from 'node:module';

let chromium;
try {
  // `import()` ignora NODE_PATH; o require de CommonJS respeita.
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.error(
    'Playwright não encontrado. Veja o cabeçalho deste arquivo (NODE_PATH=~/.fw-evals/node_modules).',
  );
  process.exit(2);
}

const BASE = process.env.FW_BASE_URL ?? 'http://localhost:3100';
const session = process.env.FW_SESSION;
const routes = [
  { name: 'inicio', path: '/' },
  { name: 'promocoes', path: '/opportunities' },
  { name: 'busca', path: '/search' },
  process.env.FW_SEARCH_ID && { name: 'resultado', path: `/search/${process.env.FW_SEARCH_ID}` },
  { name: 'transparencia', path: '/transparencia' },
  { name: 'entrar', path: '/login' },
  { name: 'cadastro', path: '/register' },
  session && { name: 'painel', path: '/', auth: true },
  session && { name: 'novo', path: '/watches/new', auth: true },
  session &&
    process.env.FW_WATCH_ID && {
      name: 'detalhe',
      path: `/watches/${process.env.FW_WATCH_ID}`,
      auth: true,
    },
].filter(Boolean);
const WIDTHS = [320, 390, 1440];
const TZ = process.env.FW_TZ ?? 'America/Sao_Paulo';

const browser = await chromium.launch(
  process.env.FW_CHROMIUM ? { executablePath: process.env.FW_CHROMIUM } : {},
);

async function open(route, width, reducedMotion) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    reducedMotion,
    timezoneId: TZ,
    locale: 'pt-BR',
  });
  if (route.auth) await ctx.addCookies([{ name: 'fw_session', value: session, url: BASE }]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url()}`));
  await page.goto(BASE + route.path, { waitUntil: 'networkidle' });
  return { ctx, page, errors };
}

// Roda dentro da página. Mede o que as regras de 01/02/03 pedem.
function measure() {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const overflow = document.documentElement.scrollWidth - window.innerWidth;

  // Texto abaixo de 12 px (DS-03). Ignora texto só para leitor de tela.
  const small = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const el = walker.currentNode.parentElement;
    if (!el || !walker.currentNode.textContent.trim() || !visible(el)) continue;
    if (el.closest('.visually-hidden, [aria-hidden="true"]')) continue;
    if (parseFloat(getComputedStyle(el).fontSize) < 12) small.add(el);
  }

  // Alvos de toque (DS-04). Link dentro de frase é exceção (WCAG 2.5.8, "inline").
  //   controle (botão, campo, link com cara de botão): meta 44 px de altura;
  //   qualquer alvo: mínimo 24 px (WCAG 2.2 AA).
  const inline = (el) => el.tagName === 'A' && el.closest('p, td, dd, figcaption, small');
  const targets = [
    ...document.querySelectorAll(
      'button, [role="button"], input:not([type="hidden"]), select, a[href]',
    ),
  ]
    .filter(visible)
    .filter(
      (el) => !inline(el) && !el.closest('.visually-hidden') && !el.classList.contains('skip-link'),
    );
  const isControl = (el) => el.tagName !== 'A' || /button/i.test(el.className);
  const height = (el) => el.getBoundingClientRect().height;
  const smallTargets = targets.filter((el) => height(el) < 24 - 0.5);
  const smallControls = targets.filter((el) => isControl(el) && height(el) < 44 - 0.5);

  // Animação apontando para @keyframes inexistente (o bug do CSS Modules, MO-02).
  const keyframes = new Set();
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    const visit = (list) => {
      for (const r of list) {
        if (r.type === CSSRule.KEYFRAMES_RULE) keyframes.add(r.name);
        if (r.cssRules) visit(r.cssRules);
      }
    };
    visit(rules);
  }
  const brokenAnimations = [];
  for (const el of document.querySelectorAll('*')) {
    const names = getComputedStyle(el)
      .animationName.split(',')
      .map((n) => n.trim());
    for (const n of names)
      if (n !== 'none' && !keyframes.has(n))
        brokenAnimations.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} → ${n}`);
  }

  const describe = (el) =>
    `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}"`;
  return {
    overflow: Math.max(0, overflow),
    smallText: [...small].map(describe),
    smallTargets: smallTargets.map((el) => `${describe(el)} ${Math.round(height(el))}px`),
    smallControls: smallControls.map((el) => `${describe(el)} ${Math.round(height(el))}px`),
    brokenAnimations: [...new Set(brokenAnimations)],
  };
}

const results = [];
for (const route of routes) {
  for (const width of WIDTHS) {
    const { ctx, page, errors } = await open(route, width, 'no-preference');
    const m = await page.evaluate(measure);
    results.push({ route: route.name, width, consoleErrors: errors, ...m });
    await ctx.close();
  }
  // MO-04: com movimento reduzido, nada fica animando depois do carregamento.
  const { ctx, page } = await open(route, 1440, 'reduce');
  await page.waitForTimeout(300);
  const running = await page.evaluate(
    () =>
      document
        .getAnimations()
        .filter(
          (a) => a.playState === 'running' && (a.effect?.getComputedTiming().duration ?? 0) > 1,
        ).length,
  );
  results.find((r) => r.route === route.name && r.width === 1440).runningWithReducedMotion =
    running;
  await ctx.close();
}
await browser.close();

const totals = {
  consoleErrors: 0,
  overflow: 0,
  smallText: 0,
  targetsBelow24: 0,
  controlsBelow44: 0,
  brokenAnimations: 0,
  runningWithReducedMotion: 0,
};
console.log(
  'rota            larg  console  overflow  texto<12  alvo<24  ctrl<44  anim-quebrada  anim-c/reduce',
);
for (const r of results) {
  totals.consoleErrors += r.consoleErrors.length;
  totals.overflow += r.overflow > 0 ? 1 : 0;
  totals.smallText += r.smallText.length;
  if (r.width === 390) {
    totals.targetsBelow24 += r.smallTargets.length;
    totals.controlsBelow44 += r.smallControls.length;
  }
  totals.brokenAnimations += r.brokenAnimations.length;
  totals.runningWithReducedMotion += r.runningWithReducedMotion ?? 0;
  console.log(
    `${r.route.padEnd(15)} ${String(r.width).padStart(4)}  ${String(r.consoleErrors.length).padStart(7)}  ${String(r.overflow).padStart(8)}  ${String(r.smallText.length).padStart(8)}  ${String(r.width === 390 ? r.smallTargets.length : '-').padStart(7)}  ${String(r.width === 390 ? r.smallControls.length : '-').padStart(7)}  ${String(r.brokenAnimations.length).padStart(13)}  ${String(r.runningWithReducedMotion ?? '-').padStart(13)}`,
  );
}
console.log('\nTotais:', JSON.stringify(totals));
const detail = process.argv.indexOf('--json');
if (detail > -1) {
  fs.writeFileSync(
    process.argv[detail + 1],
    JSON.stringify({ base: BASE, at: new Date().toISOString(), totals, results }, null, 2),
  );
  console.log(`Detalhes em ${process.argv[detail + 1]}`);
}
// Falha dura nas regras sem exceção. `controlsBelow44` é catraca (teto em ceilings.json, chave ui.controlsBelow44).
const hard =
  totals.consoleErrors +
  totals.overflow +
  totals.smallText +
  totals.targetsBelow24 +
  totals.brokenAnimations +
  totals.runningWithReducedMotion;
const ceilings = JSON.parse(fs.readFileSync(new URL('./ceilings.json', import.meta.url), 'utf8'));
const ctrlCeiling = ceilings['ui.controlsBelow44']?.teto;
const ctrlFail = typeof ctrlCeiling === 'number' && totals.controlsBelow44 > ctrlCeiling;
if (ctrlFail) console.log(`controlsBelow44 ${totals.controlsBelow44} acima do teto ${ctrlCeiling}`);
process.exit(hard || ctrlFail ? 1 : 0);
