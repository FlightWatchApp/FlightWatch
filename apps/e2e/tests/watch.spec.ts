import { expect, test } from '@playwright/test';
import { monitorFirstOffer, newEmail, registerVerified, searchSaoPauloRio } from './helpers';

test('busca, monitoramento, pausa, reativação e encerramento', async ({ page }) => {
  await registerVerified(page, newEmail('watch'));
  await searchSaoPauloRio(page);
  await expect(page.getByRole('button', { name: 'Monitorar preço' }).first()).toBeVisible();

  await monitorFirstOffer(page, '1,00');

  await page.goto('/watches');
  await page.getByRole('link', { name: 'Ver detalhes e histórico' }).first().click();
  await expect(page.getByText('Monitorando').first()).toBeVisible();

  // Mesmo modelo da página da rota (SPEC-033 fatia 5): lugares, mapa, fatos e link, fora do Google.
  await expect(page.getByRole('region', { name: 'Rota', exact: true })).toContainText('São Paulo');
  await expect(page.getByRole('heading', { name: 'Sobre a rota' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver a página da rota' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

  await page.getByRole('button', { name: 'Pausar' }).click();
  await expect(page.getByText('Pausado').first()).toBeVisible();

  await page.getByRole('button', { name: 'Reativar' }).click();
  await expect(page.getByText('Monitorando').first()).toBeVisible();

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Encerrar' }).click();
  // Encerrado é terminal: sem ações, e o monitoramento sai da lista.
  await expect(page.getByText('Encerrado').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reativar' })).toHaveCount(0);
  await page.goto('/watches');
  await expect(page.getByText('Nenhum monitoramento ainda')).toBeVisible();
});
