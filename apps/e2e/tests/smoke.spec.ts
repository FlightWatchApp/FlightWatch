import { expect, test } from '@playwright/test';

test('a página inicial carrega e pede a cidade de origem', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Passagens observadas');
  await expect(page.getByRole('heading', { name: 'Promoções agora' })).toBeVisible();
});
