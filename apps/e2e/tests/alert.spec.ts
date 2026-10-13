import { expect, test } from '@playwright/test';
import {
  monitorFirstOffer,
  newEmail,
  registerVerified,
  searchSaoPauloRio,
  waitForEmail,
} from './helpers';

test('preço desejado alto: o sistema consulta, detecta e envia o e-mail de alerta', async ({
  page,
  context,
}) => {
  const email = newEmail('alerta');
  await registerVerified(page, email);
  await searchSaoPauloRio(page);
  // Meta muito acima do preço simulado: a primeira observação já atende a regra.
  await monitorFirstOffer(page, '99999,00');

  const mail = await waitForEmail(email, 'Alerta de preço');
  expect(mail.subject).toMatch(/SAO|São Paulo/);
  expect(mail.textBody).toContain('R$');

  // O monitoramento mostra o preço atual observado e a meta atingida.
  await page.goto('/watches');
  await page.getByRole('link', { name: 'Ver detalhes e histórico' }).first().click();
  await expect(page.getByText('Monitorando').first()).toBeVisible();

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
