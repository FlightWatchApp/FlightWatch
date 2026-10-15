import Link from 'next/link';
import styles from '@/components/layout/document-page.module.css';
import { LEGAL_CONTACT_EMAIL, LEGAL_LAST_UPDATED } from '@/lib/legal';

export const metadata = {
  title: 'Política de Privacidade',
  description: 'Quais dados o Flight Watch guarda, para quê, com quem compartilha e como apagar.',
};

/** SPEC-037: descreve só o que o sistema faz hoje (tabela de fatos da spec). */
export default function PrivacyPage() {
  return (
    <article className={`container ${styles.page}`}>
      <p className={styles.eyebrow}>Privacidade</p>
      <h1>Política de Privacidade</h1>
      <p className={styles.updated}>Última atualização: {LEGAL_LAST_UPDATED}</p>
      <p className={styles.lead}>
        Guardamos o mínimo para o Flight Watch funcionar: seu e-mail, sua senha protegida e os
        monitoramentos que você cria. Não vendemos seus dados e não usamos rastreadores de
        publicidade.
      </p>

      <section className={styles.section}>
        <h2>Quem cuida dos seus dados</h2>
        <p>
          O Flight Watch é o controlador dos dados tratados neste site, conforme a Lei Geral de
          Proteção de Dados (LGPD, Lei 13.709/2018). Para qualquer assunto de privacidade, escreva
          para <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
        </p>
      </section>

      <section className={styles.section}>
        <h2>O que guardamos</h2>
        <ul>
          <li>
            <strong>Conta:</strong> e-mail, senha (guardada só como código irreversível, nunca o
            texto da senha), o fuso horário do seu navegador, para mostrar datas no seu horário, e a
            cidade de partida, se você escolher uma, para mostrar promoções saindo dela.
          </li>
          <li>
            <strong>Monitoramentos:</strong> rotas, datas, número de passageiros e os alertas que
            enviamos para você.
          </li>
          <li>
            <strong>Sem conta:</strong> buscar e ver promoções não exige cadastro. Não associamos
            essas buscas a você.
          </li>
        </ul>
        <p>Não pedimos CPF, telefone, endereço nem dados de pagamento.</p>
      </section>

      <section className={styles.section}>
        <h2>Para que usamos</h2>
        <ul>
          <li>entrar na sua conta e manter você conectado;</li>
          <li>
            consultar preços das rotas que você monitora e avisar por e-mail quando a regra for
            atendida;
          </li>
          <li>enviar e-mails da conta: confirmação de e-mail e redefinição de senha;</li>
          <li>proteger o site contra abuso, como tentativas repetidas de login.</li>
        </ul>
        <p>
          Não enviamos propaganda por e-mail. A base legal é a execução do serviço que você pediu ao
          criar a conta e o legítimo interesse em manter o site seguro.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Endereço IP e localização aproximada</h2>
        <p>
          Usamos o endereço IP de quem acessa só para limitar tentativas repetidas (por exemplo, de
          login). Essa contagem dura de 1 a 10 minutos e depois é descartada.
        </p>
        <p>
          Nossa rede de entrega (Cloudflare) pode nos informar a cidade aproximada do seu acesso.
          Usamos essa informação apenas para sugerir as promoções saindo da sua cidade naquela
          visita, e não a gravamos. Você pode trocar a cidade a qualquer momento.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Cookies</h2>
        <p>Usamos apenas dois cookies, ambos do próprio site:</p>
        <ul>
          <li>
            <strong>fw_session</strong>: mantém você conectado, por até 30 dias ou até você sair;
          </li>
          <li>
            <strong>fw_origin</strong>: lembra a cidade de partida que você escolheu, por até 1 ano.
          </li>
        </ul>
        <p>Não usamos cookies de publicidade nem de rastreamento de terceiros.</p>
      </section>

      <section className={styles.section}>
        <h2>Estatística de uso</h2>
        <p>
          Contamos as páginas visitadas e alguns cliques (como &ldquo;Ver oferta&rdquo; e
          &ldquo;Comprar passagem&rdquo;) com o Umami, uma ferramenta de código aberto que roda no
          nosso próprio servidor. Ela não usa cookies, não grava o seu IP e não identifica você:
          vemos só totais, como o número de visitas por página, o navegador e o país ou cidade
          aproximada. Se o seu navegador pedir para não ser rastreado (&ldquo;Do Not Track&rdquo;),
          nada é contado.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Com quem compartilhamos</h2>
        <ul>
          <li>
            <strong>Resend</strong>, que envia nossos e-mails: recebe seu endereço de e-mail e o
            conteúdo do aviso.
          </li>
          <li>
            <strong>Cloudflare</strong> e o <strong>provedor de hospedagem</strong>, que entregam e
            rodam o site: processam os dados técnicos de cada acesso. Nos formulários de cadastro,
            entrada e nova senha, a Cloudflare também confere se quem envia é uma pessoa (captcha
            Turnstile), a partir de dados técnicos do navegador.
          </li>
          <li>
            <strong>OpenStreetMap</strong>: nas páginas com mapa, seu navegador baixa as imagens do
            mapa diretamente dos servidores deles, que veem o seu IP.
          </li>
          <li>
            <strong>Sites parceiros</strong>: ao clicar em &ldquo;Comprar passagem&rdquo;, você vai
            para o site da companhia ou agência. Não enviamos seus dados pessoais; a partir dali
            vale a política de privacidade do parceiro. Contamos esses cliques só no total, sem
            identificar quem clicou.
          </li>
        </ul>
        <p>
          Alguns desses serviços ficam fora do Brasil (por exemplo, nos Estados Unidos). Usamos
          apenas fornecedores que oferecem proteção adequada, como pede a LGPD.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Por quanto tempo</h2>
        <p>
          Os dados da conta ficam guardados enquanto ela existir. Ao excluir a conta, apagamos seu
          e-mail e sua senha, encerramos suas sessões e cancelamos seus monitoramentos. Guardamos
          apenas registros sem nenhum dado que identifique você, como &ldquo;um alerta de preço foi
          enviado em tal data&rdquo;. Os preços de passagens observados não são dados pessoais e
          continuam no sistema.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Seus direitos</h2>
        <p>
          Você pode, a qualquer momento: confirmar quais dados temos, pedir uma cópia, corrigir,
          pedir a exclusão e tirar dúvidas sobre o uso. A exclusão da conta você mesmo faz em{' '}
          <Link href="/account">Minha conta</Link>; para o resto, escreva para{' '}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>. Se não ficar
          satisfeito, você pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).
        </p>
      </section>

      <section className={styles.section}>
        <h2>Segurança</h2>
        <p>
          O site usa conexão criptografada (HTTPS), senhas são guardadas com algoritmo próprio para
          isso, e os registros internos do sistema não contêm seu e-mail. Nenhum sistema é 100%
          seguro: se acontecer um incidente que afete você, avisaremos.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Menores de idade</h2>
        <p>O Flight Watch é feito para maiores de 18 anos.</p>
      </section>

      <section className={styles.section}>
        <h2>Mudanças nesta política</h2>
        <p>
          Quando mudarmos esta política, atualizamos a data no topo. Se a mudança for importante,
          avisaremos por e-mail quem tem conta.
        </p>
      </section>

      <p className={styles.back}>
        <Link href="/termos">Ler os Termos de Uso →</Link>
      </p>
    </article>
  );
}
