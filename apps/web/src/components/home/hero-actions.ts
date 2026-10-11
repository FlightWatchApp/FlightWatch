'use server';

import { redirect } from 'next/navigation';
import { PROMOTION_CURRENCY, PROMOTION_MARKET } from '@flight-watch/contracts';
import { searchFlights } from '@/lib/api/searches';

const IATA = /^[A-Z]{3}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "Ver voo e monitorar" do cartão da página inicial: busca a rota e a data
 * da promoção (SPEC-014) e abre o resultado, onde já existem o calendário e o
 * botão "Monitorar". Busca pública, com o mesmo rate limit de qualquer busca.
 */
export async function searchPromotionDateAction(formData: FormData): Promise<void> {
  const origin = String(formData.get('origin') ?? '');
  const destination = String(formData.get('destination') ?? '');
  const departureDate = String(formData.get('departureDate') ?? '');
  const rawReturn = String(formData.get('returnDate') ?? '');
  const returnDate = DATE.test(rawReturn) ? rawReturn : null;

  if (!IATA.test(origin) || !IATA.test(destination) || !DATE.test(departureDate)) {
    redirect('/search');
  }

  let searchId: string | null = null;
  try {
    const result = await searchFlights({
      origin,
      destination,
      tripType: returnDate ? 'ROUND_TRIP' : 'ONE_WAY',
      departureDate,
      returnDate,
      currency: PROMOTION_CURRENCY,
      market: PROMOTION_MARKET,
      maxStops: null,
      maxPriceMinor: null,
    });
    searchId = result.id;
  } catch {
    // Rate limit ou fonte fora: a pessoa cai no formulário de busca.
  }
  redirect(searchId ? `/search?searchId=${encodeURIComponent(searchId)}` : '/search');
}
