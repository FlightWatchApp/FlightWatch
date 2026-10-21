// Catraca do JavaScript do site: quanto JS (gzip) o navegador baixa no primeiro
// carregamento de cada página. Precisa do build do web (`pnpm build`).
//
//   node scripts/budget/check-web-js.mjs            confere contra web-js-ceilings.json
//   node scripts/budget/check-web-js.mjs --update   regrava os tetos com o medido
//
// Mesma regra da catraca de design: o PR que reduz o JS de uma página baixa o
// teto dela (`--update`); teto só sobe com decisão explicada no PR. Página nova
// precisa entrar no arquivo de tetos (o script avisa).
//
// Conta os arquivos comuns a todas as páginas (`rootMainFiles`) mais os de cada
// segmento da página (layout + page), tirados dos manifestos do Next. Código
// carregado depois (import dinâmico, como o mapa) não entra: é o custo de abrir
// a página, não de usá-la inteira.
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '../..');
const nextDir = join(root, 'apps/web/.next');
const ceilingsFile = join(import.meta.dirname, 'web-js-ceilings.json');
// Folga sobre o medido ao gravar o teto: o mesmo código pode variar alguns bytes
// entre máquinas (nomes e ordem de módulos).
const SLACK_KB = 2;

if (!existsSync(join(nextDir, 'build-manifest.json'))) {
  console.error(
    'sem build do web: rode `pnpm build` (ou `pnpm --filter @flight-watch/web build`) antes',
  );
  process.exit(2);
}

const buildManifest = JSON.parse(readFileSync(join(nextDir, 'build-manifest.json'), 'utf8'));
const shared = buildManifest.rootMainFiles ?? [];

const gzipCache = new Map();
function gzipKb(file) {
  if (!gzipCache.has(file)) {
    gzipCache.set(file, gzipSync(readFileSync(join(nextDir, file)), { level: 9 }).length / 1024);
  }
  return gzipCache.get(file);
}

function* clientManifests(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* clientManifests(path);
    else if (name === 'page_client-reference-manifest.js') yield path;
  }
}

/** O manifesto é um script que grava em globalThis.__RSC_MANIFEST: roda isolado. */
function readManifest(path) {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.runInNewContext(readFileSync(path, 'utf8'), sandbox, { timeout: 1000 });
  return sandbox.__RSC_MANIFEST ?? {};
}

const measured = {};
for (const path of clientManifests(join(nextDir, 'server/app'))) {
  for (const [key, entry] of Object.entries(readManifest(path))) {
    const route = key.replace(/\/page$/, '') || '/';
    const files = new Set(shared);
    for (const list of Object.values(entry.entryJSFiles ?? {}))
      for (const file of list) files.add(file);
    let total = 0;
    for (const file of files) total += gzipKb(file);
    measured[route] = Math.round(total * 10) / 10;
  }
}

const routes = Object.keys(measured).sort();
if (routes.length === 0) {
  console.error(`nenhuma página encontrada em ${relative(root, nextDir)}/server/app`);
  process.exit(2);
}

if (process.argv.includes('--update')) {
  const ceilings = {
    _comentario:
      'Teto de JS (KB, gzip) no primeiro carregamento de cada página. Gerado por check-web-js.mjs --update; o PR que reduz o JS baixa o teto; subir exige decisão explicada no PR.',
    rotas: Object.fromEntries(
      routes.map((route) => [route, Math.ceil(measured[route] + SLACK_KB)]),
    ),
  };
  writeFileSync(ceilingsFile, `${JSON.stringify(ceilings, null, 2)}\n`);
  console.log(`tetos gravados para ${routes.length} páginas em ${relative(root, ceilingsFile)}`);
  process.exit(0);
}

const ceilings = JSON.parse(readFileSync(ceilingsFile, 'utf8')).rotas;
let failures = 0;
for (const route of routes) {
  const ceiling = ceilings[route];
  const value = measured[route];
  let flag;
  if (ceiling === undefined) {
    flag = 'NOVA';
    failures += 1;
  } else if (value > ceiling) {
    flag = 'FAIL';
    failures += 1;
  } else {
    flag = ceiling - value > SLACK_KB + 2 ? 'OK↓ ' : 'OK  ';
  }
  console.log(
    `${flag} ${route.padEnd(30)} ${value.toFixed(1).padStart(7)} KB  (teto ${ceiling ?? '—'})`,
  );
}
const gone = Object.keys(ceilings).filter((route) => !(route in measured));
for (const route of gone)
  console.log(`SUMIU ${route} (está nos tetos mas não no build — tire do arquivo)`);

console.log(
  failures
    ? `\n${failures} página(s) acima do teto ou sem teto. Reduza o JS, ou registre a decisão no PR e rode com --update.`
    : '\nTodas as páginas dentro do teto. OK↓ = bem abaixo: baixe o teto com --update.',
);
process.exit(failures || gone.length ? 1 : 0);
