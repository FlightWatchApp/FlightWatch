import { listPromotions } from '@/lib/api/promotions';
import { buildGroupMessage } from '@/lib/domain/group-message';
import { MessageCard } from './message-card';
import styles from '../admin.module.css';

const DEFAULT_ORIGIN = 'SAO';
const MESSAGE_LIMIT = 10;

/** SPEC-045 parte B: mensagens prontas das melhores promoções de uma origem, para o grupo. */
export default async function GroupMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ origin?: string | string[] }>;
}) {
  const { origin: rawOrigin } = await searchParams;
  const candidate = (Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin)?.trim().toUpperCase();
  const origin = candidate && /^[A-Z]{3}$/.test(candidate) ? candidate : DEFAULT_ORIGIN;

  const feed = await listPromotions({ origin, sort: 'score', limit: MESSAGE_LIMIT }).catch(
    () => null,
  );
  const now = new Date();

  return (
    <section className={styles.section} aria-labelledby="group-messages">
      <h2 id="group-messages" className={styles.sectionTitle}>
        Mensagens para o grupo
      </h2>
      <p className={styles.muted}>
        Texto pronto das melhores promoções de uma cidade de partida. Copie e cole no grupo: o
        sistema não envia nada. Confira o preço no site do parceiro antes de postar.
      </p>

      <form method="get" className={styles.inlineForm}>
        <label htmlFor="origin">Cidade de partida (código de 3 letras)</label>
        <input
          id="origin"
          name="origin"
          defaultValue={origin}
          maxLength={3}
          pattern="[A-Za-z]{3}"
          className={styles.codeInput}
        />
        <button type="submit" className={styles.linkButton}>
          Ver mensagens
        </button>
      </form>

      {feed === null && <p>Não foi possível consultar as promoções agora. Tente de novo.</p>}
      {feed?.status === 'DISABLED' && <p>O motor de promoções está desligado nesta instalação.</p>}
      {feed?.status === 'BUDGET_EXHAUSTED' && feed.promotions.length === 0 && (
        <p>O orçamento de consultas do dia acabou e não há promoções guardadas para esta cidade.</p>
      )}
      {feed?.status === 'OK' && feed.promotions.length === 0 && (
        <p>Nenhuma promoção para {feed.originName} agora.</p>
      )}

      {feed?.promotions.map((promotion) => {
        const title = `${feed.originName} → ${promotion.destinationName}`;
        return (
          <MessageCard
            key={`${promotion.destination}-${promotion.departureDate}-${promotion.returnDate ?? ''}`}
            title={title}
            text={buildGroupMessage(
              {
                originName: feed.originName,
                destinationName: promotion.destinationName,
                tripType: promotion.tripType,
                departureDate: promotion.departureDate,
                returnDate: promotion.returnDate,
                price: promotion.price,
                discountBps: promotion.discountBps,
                referenceMedianMinor: promotion.reference.amountMinor,
                referencePointCount: promotion.reference.pointCount,
                stops: promotion.stops,
                observedAt: promotion.observedAt,
                purchaseUrl: promotion.purchaseUrl,
              },
              now,
            )}
          />
        );
      })}
    </section>
  );
}
