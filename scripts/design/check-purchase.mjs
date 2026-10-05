// EVAL-AFF-UI-001..003 (SPEC-020). Contrato dos links de compra no web.
//  1. todo <a target="_blank"> tem rel com noopener e noreferrer;
//  2. link de compra (href com purchaseUrl) só existe em arquivo que declara rel "sponsored";
//  3. toda página cuja árvore de imports renderiza link de compra também renderiza o aviso de
//     comissão (texto "receber comissão", componente PurchaseNote).
// Uso: node scripts/design/check-purchase.mjs
import path from 'node:path';
import { exists, read, stripComments, walk, lineOf, webSrc } from './lib.mjs';

const files = walk(webSrc).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
const source = new Map(files.map((f) => [f, stripComments(read(f))]));

function resolveImport(from, spec) {
  let base;
  if (spec.startsWith('@/')) base = path.join(webSrc, spec.slice(2));
  else if (spec.startsWith('.')) base = path.join(path.dirname(from), spec);
  else return null;
  for (const ext of ['', '.tsx', '.ts', '/index.tsx', '/index.ts']) {
    if (source.has(base + ext)) return base + ext;
  }
  return null;
}

function closure(entry) {
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of source.get(f).matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]/g)) {
      const dep = resolveImport(f, m[1]);
      if (dep) stack.push(dep);
    }
  }
  return seen;
}

export function run() {
  const relProblems = [];
  const unsponsored = [];
  // `=>` dentro de atributos (onClick={() => …}) não fecha a tag.
  const anchors = (src) => [...src.matchAll(/<a\b(?:=>|[^>])*>/g)];
  const relOf = (tag) => tag.match(/rel=["']([^"']*)["']/)?.[1] ?? '';
  const isPurchaseAnchor = (tag) =>
    /href=\{[^}]*purchaseUrl/.test(tag) || /sponsored/.test(relOf(tag));

  for (const [file, src] of source) {
    for (const m of anchors(src)) {
      const tag = m[0];
      const rel = relOf(tag);
      if (/target=["']_blank["']/.test(tag) && (!/noopener/.test(rel) || !/noreferrer/.test(rel))) {
        relProblems.push(
          `${file}:${lineOf(src, m.index)} target="_blank" sem rel="noopener noreferrer"`,
        );
      }
      if (/href=\{[^}]*purchaseUrl/.test(tag) && !/sponsored/.test(rel)) {
        unsponsored.push(
          `${file}:${lineOf(src, m.index)} link de compra sem rel "sponsored" → use PurchaseButton`,
        );
      }
    }
  }

  const rendersPurchase = new Set(
    [...source].filter(([, s]) => anchors(s).some((m) => isPurchaseAnchor(m[0]))).map(([f]) => f),
  );
  const rendersNote = new Set(
    [...source].filter(([, s]) => /receber comiss[ãa]o/.test(s)).map(([f]) => f),
  );
  const pages = files.filter((f) => /\/page\.tsx$/.test(f));
  const pagesWithoutNote = [];
  for (const page of pages) {
    const deps = closure(page);
    const buys = [...deps].some((d) => rendersPurchase.has(d));
    const notes = [...deps].some((d) => rendersNote.has(d));
    if (buys && !notes)
      pagesWithoutNote.push(
        `${page} tem link de compra e não mostra o aviso de comissão (PurchaseNote)`,
      );
  }
  const transparency = exists(`${webSrc}/app/transparencia/page.tsx`) ? 0 : 1;

  return {
    metrics: {
      blankSemNoopener: relProblems.length,
      compraSemSponsored: unsponsored.length,
      paginaSemAvisoComissao: pagesWithoutNote.length,
      semPaginaTransparencia: transparency,
    },
    details: [
      ...relProblems,
      ...unsponsored,
      ...pagesWithoutNote,
      ...(transparency ? ['apps/web/src/app/transparencia/page.tsx não existe'] : []),
    ],
  };
}
