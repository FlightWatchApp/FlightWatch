import { expect, test } from '@playwright/test';

test('página pública da rota: canônica, preço com origem, mapa e SEO', async ({ page }) => {
  // Código de aeroporto e slug diferente levam à URL canônica por cidade (308).
  await page.goto('/voos/gru-para-rio');
  await expect(page).toHaveURL(/\/voos\/sao-paulo-sao-para-rio-de-janeiro-rio$/);

  await expect(page.getByRole('heading', { level: 1 })).toContainText('São Paulo');
  await expect(page.getByRole('region', { name: 'Rota', exact: true })).toContainText(
    'Rio de Janeiro',
  );
  await expect(page.getByRole('heading', { name: 'Sobre a rota' })).toBeVisible();
  await expect(page.getByText('calculada entre as cidades')).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);

  // Cidade inexistente: 404 de verdade.
  const missing = await page.goto('/voos/lugar-nenhum-zzz-para-rio-de-janeiro-rio');
  expect(missing?.status()).toBe(404);
});
