import Link from 'next/link';
import styles from '@/components/layout/document-page.module.css';

export const metadata = {
  title: 'Como ganhamos dinheiro',
  description:
    'Como o Flight Watch observa preços, identifica promoções e é remunerado por parceiros.',
};

/** SPEC-020 §"Transparência na interface": página fixa, linkada de toda PurchaseNote e do rodapé. */
export default function TransparencyPage() {
  return (
    <article className={`container ${styles.page}`}>
      <p className={styles.eyebrow}>Transparência</p>
      <h1>Como ganhamos dinheiro</h1>
      <p className={styles.lead}>
        O Flight Watch é gratuito para buscar, ver promoções e monitorar viagens. Quando você compra
        uma passagem por um link nosso, o site parceiro pode nos pagar comissão. O preço para você é
        o mesmo.
      </p>

      <section className={styles.section}>
        <h2>Quem vende a passagem</h2>
        <p>
          Não vendemos, reservamos nem emitimos passagens. O botão &ldquo;Comprar passagem&rdquo;
          abre a oferta no site do parceiro (companhia aérea ou agência), em uma nova aba. É lá que
          você confirma o preço final, escolhe assentos e bagagem, paga e recebe a passagem.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Links de afiliado</h2>
        <p>
          Alguns links de compra carregam um código de afiliado que identifica que você veio do
          Flight Watch. Se a compra for concluída, o parceiro pode nos pagar uma porcentagem. Esse
          código nunca muda o preço, a ordem das promoções nem quais rotas aparecem: a classificação
          de promoção é calculada só a partir dos preços observados.
        </p>
      </section>

      <section className={styles.section}>
        <h2>O que é uma promoção aqui</h2>
        <p>
          Uma rota vira promoção quando o preço de uma data está bem abaixo dos preços das datas
          próximas da mesma rota. Cada promoção mostra quanto está abaixo e como calculamos. Não
          prometemos o menor preço de todos os sites: é o preço que o sistema observou na fonte.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Por que o preço pode mudar</h2>
        <p>
          Cada preço tem data e hora da observação e, quando o parceiro informa, uma validade.
          Tarifas aéreas mudam o tempo todo: confirme o valor no parceiro antes de pagar. Oferta
          expirada aparece com o botão &ldquo;Atualizar preço&rdquo;.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Por que o valor no site parceiro pode ser diferente do nosso</h2>
        <p>
          O nosso preço vem de uma fonte de preços observados: para cada rota e dia, o menor valor
          que ela viu recentemente, geralmente com algumas horas ou dias de idade. Ele não
          identifica um voo específico. O site parceiro, ao contrário, mostra todos os voos
          disponíveis agora, com o preço de agora. Por isso podem aparecer mais voos e valores
          diferentes: o nosso número é uma referência para você decidir quando vale olhar, e o valor
          final é sempre o do site onde você compra.
        </p>
      </section>

      <p className={styles.back}>
        <Link href="/opportunities">Ver promoções de hoje →</Link>
      </p>
    </article>
  );
}
