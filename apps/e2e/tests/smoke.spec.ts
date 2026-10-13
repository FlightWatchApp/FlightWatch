import { expect, test } from '@playwright/test';

test('a página inicial carrega com a vitrine de promoções', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Passagens observadas');
  await expect(page.getByRole('heading', { name: 'Destaques do Brasil' })).toBeVisible();
});
