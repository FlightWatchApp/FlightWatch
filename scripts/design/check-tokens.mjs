// EVAL-UI-TOKENS-001. Cor só por token: nenhum hex/rgb literal fora de styles/tokens.css.
// Catraca: o teto em ceilings.json só pode descer. Uso: node scripts/design/check-tokens.mjs
import { read, stripComments, walk, lineOf, webSrc } from './lib.mjs';

const TOKENS_FILE = `${webSrc}/styles/tokens.css`;
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/g;
// Exceções justificadas: o Next exige cor literal no metadata/viewport.
const ALLOW = [{ file: `${webSrc}/app/layout.tsx`, re: /themeColor/ }];

export function run() {
  const hits = [];
  for (const file of walk(webSrc)) {
    if (file === TOKENS_FILE || !/\.(css|tsx?)$/.test(file) || /\.test\.tsx?$/.test(file)) continue;
    const src = stripComments(read(file));
    const lines = src.split('\n');
    for (const m of src.matchAll(COLOR_RE)) {
      const line = lineOf(src, m.index);
      const allowed = ALLOW.some((a) => a.file === file && a.re.test(lines[line - 1]));
      if (!allowed) hits.push(`${file}:${line} ${m[0]}`);
    }
  }
  return { metrics: { corForaDosTokens: hits.length }, details: hits };
}
