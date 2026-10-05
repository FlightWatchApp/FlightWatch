// EVAL-UI-CONTRAST-001 (DS-02). Contraste WCAG dos pares de token usados pela interface.
// Lê styles/tokens.css, resolve var() e rgba sobre o fundo. Uso: node scripts/design/check-contrast.mjs
import { exists, read, webSrc } from './lib.mjs';

// [texto/traço, fundo, mínimo]. 4,5 texto normal; 3 texto grande, borda de controle, foco e gráfico.
export const PAIRS = [
  ['--color-text-primary', '--color-bg', 4.5],
  ['--color-text-secondary', '--color-bg', 4.5],
  ['--color-text-muted', '--color-bg', 4.5],
  ['--color-text-muted', '--color-surface', 4.5],
  ['--color-text-muted', '--color-surface-sunken', 4.5],
  ['--color-action', '--color-bg', 4.5],
  ['--color-text-on-dark', '--color-brand', 4.5],
  ['--color-text-on-dark', '--color-brand-strong', 4.5],
  ['--color-text-on-dark-muted', '--color-brand-strong', 4.5],
  ['--color-action-soft-text', '--color-action-soft-bg', 4.5],
  ['--color-route-text', '--color-bg', 4.5],
  ['--color-route-text', '--color-route-soft', 4.5],
  ['--color-text-on-accent', '--color-success', 4.5],
  ['--color-success-soft-text', '--color-success-soft-bg', 4.5],
  ['--color-warning-soft-text', '--color-warning-soft-bg', 4.5],
  ['--color-danger-soft-text', '--color-danger-soft-bg', 4.5],
  ['--color-text-on-dark', '--color-danger', 4.5],
  ['--color-border-strong', '--color-surface', 3],
  ['--color-focus-ring', '--color-bg', 3],
  ['--color-route', '--color-bg', 3],
  ['--color-route', '--color-surface', 3],
];

function parseColor(v) {
  v = v.trim().toLowerCase();
  if (v === 'white') return [255, 255, 255, 1];
  if (v === 'black') return [0, 0, 0, 1];
  let m = v.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return [...n, h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
  }
  m = v.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return [p[0], p[1], p[2], p[3] ?? 1];
  }
  return null;
}

const lum = ([r, g, b]) => {
  const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const over = (fg, bg) => fg.slice(0, 3).map((c, i) => c * fg[3] + bg[i] * (1 - fg[3]));
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

export function run() {
  const file = `${webSrc}/styles/tokens.css`;
  if (!exists(file))
    return { metrics: { contrasteAbaixo: PAIRS.length }, details: [`${file} não existe`] };
  const css = read(file);
  const rootBlock = css.match(/:root\s*{([\s\S]*?)\n}/)?.[1] ?? '';
  const vars = Object.fromEntries(
    [...rootBlock.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );
  const resolve = (name, depth = 0) => {
    const v = vars[name];
    if (v === undefined || depth > 8) return null;
    const ref = v.match(/^var\((--[\w-]+)\)$/);
    return ref ? resolve(ref[1], depth + 1) : parseColor(v);
  };

  const bad = [];
  for (const [fgName, bgName, min] of PAIRS) {
    const fg = resolve(fgName);
    const bg = resolve(bgName);
    if (!fg || !bg) {
      bad.push(`${fgName} sobre ${bgName}: token ausente`);
      continue;
    }
    const r = ratio(over(fg, bg), bg);
    if (r < min) bad.push(`${fgName} sobre ${bgName}: ${r.toFixed(2)} (mínimo ${min})`);
  }
  return { metrics: { contrasteAbaixo: bad.length }, details: bad };
}
