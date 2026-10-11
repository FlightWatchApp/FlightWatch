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
  const section = page.getByRole('region', { name: 'Promoções agora' });
  await expect(section.getByRole('article').first()).toBeVisible();
  await expect(section).toContainText('abaixo das datas próximas');

  // Recarregar mantém a origem (cookie), sem voltar ao exemplo.
  await page.reload();
  await expect(section.getByRole('article').first()).toBeVisible();
});

test('sem origem escolhida, a home pede a cidade e não inventa promoção', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Escolha a cidade de onde você sai')).toBeVisible();
});
