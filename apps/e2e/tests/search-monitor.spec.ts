import { expect, test } from '@playwright/test';
import { newEmail, registerVerified, searchSaoPauloRio } from './helpers';

// SPEC-045: qualquer viagem pesquisada pode ser monitorada, com ou sem preço.
test('da busca ao formulário de monitoramento já com a viagem preenchida', async ({ page }) => {
  await registerVerified(page, newEmail('monitor-cta'));
  const departureDate = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
  await searchSaoPauloRio(page, departureDate);

  // O parceiro padrão do e2e é o simulado; o aviso de preço aparece de qualquer jeito.
  await expect(
    page.getByText(/o site parceiro mostra os voos e valores de agora/).first(),
  ).toBeVisible();

  const monitor = page.getByRole('complementary', { name: 'Monitorar esta viagem' });
  await expect(monitor).toBeVisible();
  await monitor.getByRole('link', { name: 'Monitorar esta viagem' }).click();

  await expect(page).toHaveURL(/\/watches\/new\?/);
  // O cabeçalho também tem um formulário de monitoramento: escopo no conteúdo da página.
  const form = page.getByRole('main');
  await expect(form.getByRole('combobox', { name: 'Origem' })).toHaveValue(/São Paulo \(SAO\)/);
  await expect(form.getByRole('combobox', { name: 'Destino' })).toHaveValue(
    /Rio de Janeiro \(RIO\)/,
  );
  await expect(form.getByLabel('Tipo de viagem')).toHaveValue('ONE_WAY');
  await expect(form.getByLabel('Data de ida')).toHaveValue(departureDate);

  // E dali o monitoramento nasce de verdade.
  await form.getByRole('button', { name: 'Criar monitoramento' }).click();
  await expect(page).toHaveURL(/\/watches$/);
  await expect(page.getByRole('main')).toContainText('São Paulo');
});

test('a página de monitoramento ignora parâmetros inválidos sem quebrar', async ({ page }) => {
  await registerVerified(page, newEmail('monitor-bad'));
  await page.goto('/watches/new?origin=<script>&destination=R/O&departureDate=ontem&tripType=X');
  await expect(page.getByRole('heading', { name: 'Novo monitoramento' })).toBeVisible();
  await expect(page.getByRole('main').getByLabel('Data de ida')).toHaveValue('');
});
