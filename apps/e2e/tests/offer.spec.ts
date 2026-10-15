import { expect, test } from '@playwright/test';

// SPEC-038: "Ver oferta" em todo cartão leva à página da oferta, com o voo e o aviso de preço.
test('do cartão de promoção à página da oferta: preço, voo do dia, aviso e compra no parceiro', async ({
  page,
}) => {
  // A origem na URL calcula o feed na hora (a vitrine da home depende do aquecimento).
  await page.goto('/opportunities?origin=SAO');
  const firstCard = page.getByRole('article', { name: /^Promoção São Paulo/ }).first();
  await expect(firstCard.getByRole('link', { name: /Ver oferta/ })).toBeVisible();
  await expect(firstCard.getByRole('link', { name: /site parceiro/ })).toHaveCount(0);

  await firstCard.getByRole('link', { name: /Ver oferta/ }).click();
  await expect(page).toHaveURL(/\/voos\/[a-z-]+-sao-para-[a-z-]+-[a-z]{3}\/\d{4}-\d{2}-\d{2}$/);

  const offer = page.getByRole('region', { name: /^Oferta São Paulo para/ });
  await expect(offer).toBeVisible();
  await expect(offer).toContainText('R$');
  await expect(offer).toContainText('Voo mais barato que encontramos neste dia');
  await expect(page.getByText(/Preço visto em agências parceiras em/)).toBeVisible();
  const purchase = offer.getByRole('link', { name: /Comprar passagem/ });
  await expect(purchase).toHaveAttribute('target', '_blank');
  await expect(page.getByRole('link', { name: /Ver todas as datas de São Paulo/ })).toBeVisible();
});

test('endereço da oferta fora do canônico redireciona; data inválida é 404', async ({ page }) => {
  const date = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
  await page.goto(`/voos/sao-para-rio/${date}`);
  await expect(page).toHaveURL(new RegExp(`/voos/sao-paulo-sao-para-rio-de-janeiro-rio/${date}$`));

  const response = await page.goto('/voos/sao-paulo-sao-para-rio-de-janeiro-rio/2027-02-30');
  expect(response?.status()).toBe(404);
});
