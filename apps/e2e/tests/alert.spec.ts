import { expect, test } from '@playwright/test';
import {
  cheapSimulatedDate,
  monitorFirstOffer,
  newEmail,
  registerVerified,
  searchSaoPauloRio,
  waitForEmail,
} from './helpers';

test('preço bem abaixo do normal: o sistema consulta, detecta e envia o e-mail de alerta', async ({
  page,
  context,
}) => {
  const email = newEmail('alerta');
  await registerVerified(page, email);
  // SPEC-039: data cujo preço já está 15% abaixo das datas próximas — a primeira
  // observação dispara o alerta de preço baixo pela linha de base da criação.
  await searchSaoPauloRio(page, cheapSimulatedDate('SAO', 'RIO'));
  await monitorFirstOffer(page);

  const mail = await waitForEmail(email, 'Preço baixo');
  expect(mail.subject).toMatch(/SAO|São Paulo/);
  expect(mail.textBody).toMatch(/\d+% abaixo do preço normal desta viagem/);
  expect(mail.textBody.toLowerCase()).not.toContain('mercado');

  // O monitoramento mostra o preço observado, o preço normal e o destaque.
  await page.goto('/watches');
  await page.getByRole('link', { name: 'Ver detalhes e histórico' }).first().click();
  await expect(page.getByText('Monitorando').first()).toBeVisible();
  await expect(page.getByText('Preço normal', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Bem abaixo do normal', { exact: true })).toBeVisible();
  // SPEC-038: o voo mais barato que a fonte viu no dia (provedor simulado).
  await expect(page.getByText('Voo mais barato que encontramos neste dia')).toBeVisible();

  // Clique de compra: abre o parceiro em outra aba, sem sair do Flight Watch.
  await context.route('**/*simulated-provider*/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>parceiro</h1>' }),
  );
  const purchase = page.getByRole('link', { name: /Comprar passagem|Atualizar preço/ }).first();
  await expect(purchase).toHaveAttribute('target', '_blank');
  await expect(purchase).toHaveAttribute('rel', /noopener/);
  const [popup] = await Promise.all([context.waitForEvent('page'), purchase.click()]);
  await expect(popup).toHaveURL(/simulated-provider/);
});
