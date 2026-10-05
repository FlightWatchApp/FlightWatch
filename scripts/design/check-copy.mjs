// EVAL-COPY-001. Frases proibidas na interface e nos e-mails (CLAUDE.md §2.3, docs/BRAND.md "Tom de voz").
// Lê só código de produto (sem testes e sem comentários). Uso: node scripts/design/check-copy.mjs
import { read, stripComments, walk, lineOf, isTest } from './lib.mjs';

export const FORBIDDEN = [
  {
    id: 'mercado',
    re: /menor\s+pre[çc]o\s+do\s+mercado/gi,
    use: 'menor preço observado pelo sistema',
  },
  {
    id: 'garantido',
    re: /garantid[oa]s?/gi,
    use: 'pode mudar a qualquer momento; confirme no site parceiro',
  },
  { id: 'tempo-real', re: /tempo\s+real/gi, use: 'preço visto hoje às 12:44' },
  {
    id: 'melhor-momento',
    re: /melhor\s+momento\s+para\s+comprar/gi,
    use: 'último preço observado',
  },
  {
    id: 'urgencia',
    re: /imperd[íi]vel|corre\s+que\s+acaba|[úu]ltimas\s+vagas/gi,
    use: 'pode mudar a qualquer momento',
  },
  { id: 'desconto', re: /\bdesconto\b/gi, use: '18% abaixo da média observada' },
  { id: 'preco-alvo', re: /pre[çc]o[- ]alvo/gi, use: 'preço desejado' },
];

const DIRS = ['apps/web/src', 'packages/notifications/src'];

export function run() {
  const hits = [];
  for (const dir of DIRS) {
    for (const file of walk(dir)) {
      if (!/\.(tsx?|mjs|html)$/.test(file) || isTest(file)) continue;
      const src = stripComments(read(file));
      for (const rule of FORBIDDEN) {
        for (const m of src.matchAll(rule.re)) {
          hits.push({ file, line: lineOf(src, m.index), text: m[0], rule });
        }
      }
    }
  }
  return {
    metrics: { frasesProibidas: hits.length },
    details: hits.map((h) => `${h.file}:${h.line} "${h.text}" → use "${h.rule.use}"`),
  };
}
