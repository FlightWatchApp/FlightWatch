import { expect, test } from '@playwright/test';
import { monitorFirstOffer, newEmail, registerVerified, searchSaoPauloRio } from './helpers';

test('busca, monitoramento, pausa, reativação e encerramento', async ({ page }) => {
  await registerVerified(page, newEmail('watch'));
  await searchSaoPauloRio(page);
  await expect(page.getByRole('button', { name: 'Monitorar preço' }).first()).toBeVisible();

  await monitorFirstOffer(page, '1,00');

  await page.goto('/watches');
  await page
    .getByRole('link', { name: /São Paulo|SAO/ })
    .first()
    .click();
  await expect(page.getByText('Monitorando').first()).toBeVisible();

  await page.getByRole('button', { name: 'Pausar' }).click();
  await expect(page.getByText('Pausado').first()).toBeVisible();

  await page.getByRole('button', { name: 'Reativar' }).click();
  await expect(page.getByText('Monitorando').first()).toBeVisible();

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Encerrar' }).click();
  // Encerrado é terminal: o app volta para a lista, onde ele já não aparece.
  await expect(page).toHaveURL(/\/watches$/);
  await expect(page.getByText('Nenhum monitoramento ainda')).toBeVisible();
});
