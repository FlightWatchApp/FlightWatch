import type { PricePoint } from '@/lib/api/types';

/**
 * CP-10: a API devolve o histórico do mais novo para o mais antigo (mesma
 * ordem de `GET /v1/watches/:id`); o gráfico precisa do sentido contrário —
 * do mais antigo ao mais novo, esquerda para direita. Função pura e
 * testada em vez de inline no componente, porque inverter a ordem errada
 * silenciosamente desenha a linha ao contrário sem nenhum erro visível.
 */
export function sortChronologically(points: PricePoint[]): PricePoint[] {
  return [...points].sort(
    (a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime(),
  );
}

/** Índice do ponto de menor preço — usado para o destaque "menor já visto" do gráfico. */
export function indexOfLowest(points: PricePoint[]): number {
  if (points.length === 0) return -1;
  let lowest = 0;
  for (let i = 1; i < points.length; i += 1) {
    const current = points[i];
    const best = points[lowest];
    if (current && best && current.amountMinor < best.amountMinor) {
      lowest = i;
    }
  }
  return lowest;
}
