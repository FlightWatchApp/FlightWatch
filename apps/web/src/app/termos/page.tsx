import Link from 'next/link';
import styles from '@/components/layout/document-page.module.css';
import { LEGAL_CONTACT_EMAIL, LEGAL_LAST_UPDATED } from '@/lib/legal';

export const metadata = {
  title: 'Termos de Uso',
  description:
    'As regras para usar o Flight Watch: o que o serviço faz, o que não faz e suas responsabilidades.',
};

/** SPEC-037: termos do serviço gratuito de observação de preços. */
export default function TermsPage() {
  return (
    <article className={`container ${styles.page}`}>
      <p className={styles.eyebrow}>Termos</p>
      <h1>Termos de Uso</h1>
      <p className={styles.updated}>Última atualização: {LEGAL_LAST_UPDATED}</p>
      <p className={styles.lead}>
        Ao usar o Flight Watch ou criar uma conta, você concorda com estes termos. Eles são curtos
        de propósito: leia antes de usar.
      </p>

      <section className={styles.section}>
        <h2>O que é o Flight Watch</h2>
        <p>
          Um serviço gratuito que observa preços de passagens aéreas, mostra promoções e avisa por
          e-mail quando o preço de uma rota que você monitora atende à regra que você escolheu.
        </p>
      </section>

      <section className={styles.section}>
        <h2>O que o Flight Watch não é</h2>
        <ul>
          <li>
            Não somos agência de viagens nem companhia aérea. Não vendemos, reservamos nem emitimos
            passagens, e não recebemos pagamento por elas.
          </li>
          <li>
            A compra acontece no site do parceiro, com as regras, preços finais, taxas e políticas
            de cancelamento dele. Dúvidas sobre a passagem comprada são com o parceiro.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2>Sobre os preços</h2>
        <ul>
          <li>
            Os preços vêm de fontes parceiras e mostram o que o sistema observou em um momento,
            sempre com a data da observação. Tarifas mudam o tempo todo: o valor pode ser outro
            quando você abrir o parceiro.
          </li>
          <li>
            &ldquo;Menor preço&rdquo; aqui significa o menor preço observado pelo sistema, e não o
            de todos os sites. Não garantimos disponibilidade nem preço.
          </li>
          <li>
            Confirme sempre o valor final, as datas e as condições no parceiro antes de pagar.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2>Links de afiliado</h2>
        <p>
          Alguns links de compra são de afiliado: se você comprar, o parceiro pode nos pagar uma
          comissão, sem custo extra para você. Veja{' '}
          <Link href="/transparencia">como ganhamos dinheiro</Link>.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Sua conta</h2>
        <ul>
          <li>Você precisa ter 18 anos ou mais e usar um e-mail que seja seu.</li>
          <li>Guarde sua senha; ações feitas com ela contam como suas.</li>
          <li>
            Você pode pausar ou encerrar monitoramentos em{' '}
            <Link href="/watches">Meus monitoramentos</Link> e excluir a conta em{' '}
            <Link href="/account">Minha conta</Link>, quando quiser.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2>Uso permitido</h2>
        <p>Não é permitido:</p>
        <ul>
          <li>
            usar robôs, scripts ou consultas automáticas para copiar preços ou sobrecarregar o site;
          </li>
          <li>tentar acessar contas ou dados de outras pessoas, ou burlar limites de segurança;</li>
          <li>usar o serviço para qualquer fim ilegal.</li>
        </ul>
        <p>Podemos suspender contas que descumpram estas regras.</p>
      </section>

      <section className={styles.section}>
        <h2>Disponibilidade</h2>
        <p>
          Fazemos o possível para manter o site e os alertas funcionando, mas o serviço é gratuito e
          pode ficar fora do ar, atrasar avisos ou mudar funcionalidades. Um alerta pode não chegar
          (por exemplo, por filtro de spam ou falha da fonte de preços): não dependa apenas dele
          para uma compra importante.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Responsabilidade</h2>
        <p>
          Não respondemos pela compra feita no parceiro, por mudanças de preço depois da observação
          nem por decisões tomadas só com base nos nossos avisos. Nada nestes termos limita direitos
          que o Código de Defesa do Consumidor garante a você.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Privacidade</h2>
        <p>
          O que fazemos com seus dados está na{' '}
          <Link href="/privacidade">Política de Privacidade</Link>.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Mudanças e contato</h2>
        <p>
          Podemos atualizar estes termos; a data no topo mostra a versão em vigor e avisaremos por
          e-mail mudanças importantes. Estes termos seguem a lei brasileira. Dúvidas:{' '}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
        </p>
      </section>

      <p className={styles.back}>
        <Link href="/opportunities">Ver promoções de hoje →</Link>
      </p>
    </article>
  );
}
