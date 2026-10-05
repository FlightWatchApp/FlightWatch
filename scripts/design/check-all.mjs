// Gate de design do refactor (docs/design-refactor/05-quality-gates.md, G-DS).
// Uso: node scripts/design/check-all.mjs [--details]
// Catraca: cada métrica tem um teto em ceilings.json. Falha se passar do teto. Quando uma tarefa
// melhora um número, ela baixa o teto no mesmo PR. Teto nunca sobe sem decisão registrada em
// docs/design-refactor/09-decisoes.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as contrast from './check-contrast.mjs';
import * as copy from './check-copy.mjs';
import * as cssModules from './check-css-modules.mjs';
import * as tokens from './check-tokens.mjs';
import * as purchase from './check-purchase.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ceilings = JSON.parse(fs.readFileSync(path.join(here, 'ceilings.json'), 'utf8'));
const showDetails = process.argv.includes('--details');

let failures = 0;
for (const [name, check] of Object.entries({ copy, cssModules, tokens, contrast, purchase })) {
  const { metrics, details } = check.run();
  for (const [key, value] of Object.entries(metrics)) {
    const { teto, meta } = ceilings[key] ?? { teto: 0, meta: 0 }; // métrica nova começa em 0
    const ok = value <= teto;
    if (!ok) failures++;
    const flag = ok ? (value <= meta ? 'OK  ' : 'OK* ') : 'FAIL';
    console.log(
      `${flag} ${key.padEnd(24)} ${String(value).padStart(4)}  (teto ${teto}, meta ${meta})`,
    );
  }
  if ((showDetails || details.length <= 12) && details.length) {
    for (const d of details) console.log(`       ${d}`);
  } else if (details.length) {
    console.log(`       … ${details.length} ocorrências de ${name}; rode com --details`);
  }
}
console.log(
  failures
    ? `\n${failures} métrica(s) acima do teto.`
    : '\nTodas as métricas dentro do teto. OK* = dentro do teto, ainda acima da meta.',
);
process.exit(failures ? 1 : 0);
