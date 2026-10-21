// Prints de páginas para o agente (e a pessoa) olharem depois de mexer na tela.
//
//   pnpm screenshot /opportunities /voos/sao-rio
//   SCREENSHOT_EMAIL=... SCREENSHOT_PASSWORD=... pnpm screenshot --login /watches
//
// Para cada página, em desktop (1440×900) e celular (390×844): print da página
// inteira em .local/screenshots/<data-hora>/ e três verificações automáticas —
// status HTTP e erros no console, rolagem horizontal, e se algo cobre o
// cabeçalho fixo depois de rolar (o bug do mapa sobre o menu). Sai com código 1
// se alguma falhar. Precisa do site rodando (padrão: http://localhost:3100).
// As funções passadas a page.evaluate rodam no navegador, não no Node.
/* global document, window, getComputedStyle, requestAnimationFrame */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'celular', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];
const SETTLE_MS = 1500;
// Varredura do cabeçalho: rola de SCROLL_STEP_PX em SCROLL_STEP_PX até SCROLL_MAX_PX e,
// em cada posição, testa um ponto a cada SAMPLE_STEP_PX ao longo do cabeçalho.
const SCROLL_STEP_PX = 120;
const SCROLL_MAX_PX = 4000;
const SAMPLE_STEP_PX = 48;

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const [value] = args.splice(index, 2).slice(1);
  return value;
};
const flag = (name) => {
  const index = args.indexOf(name);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
};

const baseUrl = (
  option('--base') ??
  process.env.SCREENSHOT_BASE_URL ??
  'http://localhost:3100'
).replace(/\/$/, '');
const login = flag('--login');
const paths = args.filter((arg) => arg.startsWith('/'));
if (paths.length === 0) {
  console.error('uso: pnpm screenshot [--login] [--base URL] /caminho [/outro ...]');
  process.exit(2);
}

const root = resolve(import.meta.dirname, '../../..');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = join(root, '.local', 'screenshots', stamp);
mkdirSync(outDir, { recursive: true });

const slug = (path) =>
  path
    .replace(/^\/$/, 'inicio')
    .replace(/^\//, '')
    .replace(/[^a-zA-Z0-9-]+/g, '_');

const browser = await chromium.launch();
const problems = [];
try {
  for (const device of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: device.viewport,
      isMobile: device.isMobile ?? false,
      hasTouch: device.hasTouch ?? false,
      locale: 'pt-BR',
    });
    const page = await context.newPage();
    if (login) await signIn(page);

    for (const path of paths) {
      const where = `${path} (${device.name})`;
      const consoleErrors = [];
      const onConsole = (message) =>
        message.type() === 'error' && consoleErrors.push(message.text());
      const onPageError = (error) => consoleErrors.push(error.message);
      page.on('console', onConsole);
      page.on('pageerror', onPageError);

      const response = await page.goto(`${baseUrl}${path}`, { waitUntil: 'load' });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(SETTLE_MS);

      const file = join(outDir, `${slug(path)}-${device.name}.png`);
      await page.screenshot({ path: file, fullPage: true });

      const status = response?.status() ?? 0;
      if (status >= 400 || status === 0) problems.push(`${where}: HTTP ${status}`);
      for (const text of consoleErrors)
        problems.push(`${where}: erro no console: ${text.slice(0, 200)}`);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      if (overflow > 1) problems.push(`${where}: rolagem horizontal de ${overflow}px`);

      const covered = await headerCoveredAfterScroll(page);
      if (covered) problems.push(`${where}: "${covered}" cobre o cabeçalho fixo depois de rolar`);

      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      console.log(`print: ${file}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problema(s):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log('\nsem problemas nas verificações automáticas — agora olhe os prints');

/** Entra com a conta de teste do ambiente local. A senha vem do ambiente e nunca é impressa. */
async function signIn(page) {
  const email = process.env.SCREENSHOT_EMAIL;
  const password = process.env.SCREENSHOT_PASSWORD;
  if (!email || !password) {
    console.error('--login precisa de SCREENSHOT_EMAIL e SCREENSHOT_PASSWORD no ambiente');
    process.exit(2);
  }
  await page.goto(`${baseUrl}/login`, { waitUntil: 'load' });
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.locator('button[type=submit]').click();
  await page
    .waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 })
    .catch(() => {
      console.error('login não concluído (conta, senha ou captcha?)');
      process.exit(2);
    });
}

/**
 * Rola a página aos poucos e, em cada posição, confere pontos ao longo do
 * cabeçalho fixo: o que está por cima tem de ser o próprio cabeçalho. Devolve a
 * descrição do primeiro intruso (com a posição da rolagem), ou null.
 *
 * `elementFromPoint` ignora elementos com `pointer-events: none` — e as camadas
 * do mapa (Leaflet) são assim: na tela cobriam o menu, mas o teste "atravessava"
 * o mapa e achava o cabeçalho embaixo. Por isso a medição liga `pointer-events`
 * em tudo enquanto roda.
 */
async function headerCoveredAfterScroll(page) {
  return page.evaluate(
    async ({ step, max, sample }) => {
      const header = [...document.querySelectorAll('header')].find((element) => {
        const position = getComputedStyle(element).position;
        return position === 'sticky' || position === 'fixed';
      });
      if (!header) return null;
      const frame = () =>
        new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const limit = Math.min(max, document.documentElement.scrollHeight - window.innerHeight);
      const probe = document.createElement('style');
      probe.textContent = '* { pointer-events: auto !important; }';
      document.head.append(probe);
      try {
        for (let y = step; y <= limit; y += step) {
          window.scrollTo(0, y);
          await frame();
          const box = header.getBoundingClientRect();
          const middle = box.top + box.height / 2;
          for (let x = box.left + sample / 2; x < box.right; x += sample) {
            const top = document.elementFromPoint(x, middle);
            if (top && !header.contains(top)) {
              const name =
                typeof top.className === 'string' && top.className
                  ? `.${top.className.split(' ')[0]}`
                  : '';
              return `${top.tagName.toLowerCase()}${name} (rolagem ${y}px)`;
            }
          }
        }
        return null;
      } finally {
        probe.remove();
        window.scrollTo(0, 0);
      }
    },
    { step: SCROLL_STEP_PX, max: SCROLL_MAX_PX, sample: SAMPLE_STEP_PX },
  );
}
