import { SearchForm } from './search-form';
import styles from './page.module.css';

/**
 * SPEC-014: busca pública — ao contrário de `watches/new`, esta página não
 * checa sessão nem redireciona. Autenticação só é exigida mais adiante, ao
 * tentar "Monitorar" uma oferta.
 */
export default function SearchPage() {
  return (
    <div className={`container ${styles.page}`}>
      <div>
        <h1>Buscar passagens</h1>
        <p className={styles.subtitle}>
          Veja as opções disponíveis agora. Se quiser, monitore uma delas depois — sem criar conta
          pra buscar.
        </p>
      </div>
      <SearchForm />
    </div>
  );
}
