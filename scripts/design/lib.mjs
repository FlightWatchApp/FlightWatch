// Utilitários dos checks de design. Sem dependências: só Node >= 20.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const webSrc = 'apps/web/src';

export const exists = (p) => fs.existsSync(path.join(root, p));
export const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

export function walk(dir) {
  if (!exists(dir)) return [];
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' || e.name === '.next' ? [] : walk(rel);
    return [rel];
  });
}

/** Remove comentários de TS/TSX/CSS mantendo as quebras de linha (números de linha continuam certos). */
export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

export const lineOf = (src, index) => src.slice(0, index).split('\n').length;

export function isTest(file) {
  return /\.(test|spec|e2e\.spec)\.[jt]sx?$/.test(file);
}
