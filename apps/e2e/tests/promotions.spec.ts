import { expect, test } from '@playwright/test';

test('promoções por origem escolhida: página de promoções e seção da página inicial', async ({
  page,
}) => {
  await page.goto('/opportunities?origin=SAO');
  const cards = page.getByRole('article', { name: /^Promoção São Paulo/ });
  await expect(cards.first()).toBeVisible();
  await expect(cards.first()).toContainText('abaixo das datas próximas');
  await expect(cards.first()).toContainText('Como calculamos?');

  // Na página inicial a pessoa escolhe a cidade no cartão; a escolha vira cookie e alimenta a seção.
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Saindo de' }).fill('São Paulo');
  await page
    .getByRole('option', { name: /São Paulo/ })
    .first()
    .click();
  const section = page.getByRole('region', { name: 'Promoções saindo de São Paulo' });
  await expect(section.getByRole('article').first()).toBeVisible();
  await expect(section).toContainText('abaixo das datas próximas');

  // Recarregar mantém a origem (cookie), sem voltar ao exemplo.
  await page.reload();
  await expect(section.getByRole('article').first()).toBeVisible();
});

// SPEC-034: sem cidade, a home mostra a vitrine (não o exemplo) e cada cartão diz de onde sai.
test('sem origem escolhida, a home mostra a vitrine com a origem de cada promoção', async ({
  page,
}) => {
  await page.goto('/');
  const showcase = page.getByRole('region', { name: 'Destaques do Brasil' });
  await expect(page.getByText('Exemplo', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('article').first()).toContainText('Saindo de São Paulo');
  await expect(showcase).toBeVisible();
});

// SPEC-034: cidade sugerida pelo acesso (cabeçalhos da Cloudflare), sem gravar cookie.
test('cidade sugerida pelo acesso aparece como sugestão e não vira cookie', async ({ browser }) => {
  const context = await browser.newContext({
    extraHTTPHeaders: { 'cf-ipcountry': 'BR', 'cf-ipcity': 'S%C3%A3o%20Paulo' },
  });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByText('Sugerida pelo seu acesso')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Saindo de' })).toHaveValue(/São Paulo/);
  expect((await context.cookies()).some((cookie) => cookie.name === 'fw_origin')).toBe(false);
  await context.close();
});

// SPEC-034: /opportunities sem cidade também mostra a vitrine, não só o pedido de cidade.
test('página de promoções sem cidade mostra os Destaques do Brasil', async ({ page }) => {
  await page.goto('/opportunities');
  await expect(page.getByRole('heading', { name: 'De onde você sai?' })).toBeVisible();
  const showcase = page.getByRole('region', { name: 'Destaques do Brasil' });
  // Cada cartão diz de onde sai ("São Paulo para …").
  await expect(
    showcase.getByRole('article', { name: /^Promoção São Paulo para / }).first(),
  ).toBeVisible();
});
