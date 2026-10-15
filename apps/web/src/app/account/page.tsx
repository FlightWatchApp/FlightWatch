import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/account/auth-shell';
import { Card } from '@/components/ui/card';
import { getCurrentUser } from '@/lib/api/auth';
import { DeleteAccountForm } from './delete-account-form';
import { HomeCityForm } from './home-city-form';
import styles from './page.module.css';

/** SPEC-027: dados da conta, troca de senha e exclusão. SPEC-040: cidade de partida. */
export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  return (
    <AuthShell title="Minha conta" subtitle={user.email}>
      <Card>
        <section className={styles.section} aria-labelledby="account-city">
          <h2 id="account-city" className={styles.sectionTitle}>
            De onde você costuma sair
          </h2>
          <p className={styles.muted}>
            Usamos para mostrar promoções saindo dessa cidade e já preencher a busca, em qualquer
            aparelho em que você entrar.
          </p>
          <HomeCityForm initial={user.homeCity} />
        </section>
      </Card>

      <Card>
        <section className={styles.section} aria-labelledby="account-password">
          <h2 id="account-password" className={styles.sectionTitle}>
            Senha
          </h2>
          <p className={styles.muted}>
            Para trocar a senha, enviamos um link para o seu email. Ao definir a nova senha, todas
            as sessões abertas são encerradas.
          </p>
          <Link href="/forgot-password">Trocar senha</Link>
        </section>
      </Card>

      <Card>
        <section className={styles.section} aria-labelledby="account-delete">
          <h2 id="account-delete" className={styles.sectionTitle}>
            Excluir conta
          </h2>
          <p className={styles.muted}>
            Seus monitoramentos são encerrados, os alertas param e seu email é removido da conta.
            Essa ação não pode ser desfeita.
          </p>
          <DeleteAccountForm />
        </section>
      </Card>
    </AuthShell>
  );
}
