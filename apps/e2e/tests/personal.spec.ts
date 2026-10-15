import { expect, type Page, test } from '@playwright/test';
import { monitorFirstOffer, newEmail, registerVerified, searchSaoPauloRio } from './helpers';

async function panelTitles(page: Page): Promise<string[]> {
  return page.locator('section[aria-labelledby^="panel-"] h2').allInnerTexts();
}

async function openFirstOffer(page: Page): Promise<void> {
  await page.goto('/opportunities?origin=SAO');
  await page
    .getByRole('link', { name: /Ver oferta/ })
    .first()
    .click();
  await expect(page.getByRole('region', { name: /^Oferta / })).toBeVisible();
}

// SPEC-040: os painéis aparecem conforme a pessoa usa o sistema.
test('painéis pessoais: pessoa nova vê só a busca; com cidade e monitoramento, vê o resto', async ({
  page,
}) => {
  await registerVerified(page, newEmail('paineis'));

  await openFirstOffer(page);
  expect(await panelTitles(page)).toEqual(['Buscar nova passagem']);

  // Cidade de partida na conta: a busca já abre com ela.
  await page.goto('/account');
  await page.getByRole('combobox', { name: 'Cidade de partida' }).fill('Rio de Janeiro');
  await page
    .getByRole('option', { name: /Rio de Janeiro/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Salvar cidade' }).click();
  await expect(page.getByText('Cidade salva: Rio de Janeiro.')).toBeVisible();
  await page.goto('/search');
  await expect(page.locator('main').getByRole('combobox', { name: 'Origem' }).first()).toHaveValue(
    /Rio de Janeiro/,
  );

  // Com um monitoramento, aparecem os ativos e o resumo.
  await searchSaoPauloRio(page);
  await monitorFirstOffer(page);
  await openFirstOffer(page);
  const titles = await panelTitles(page);
  expect(titles).toContain('Monitoramentos ativos');
  expect(titles).toContain('Seu resumo');
  expect(titles.at(-1)).toBe('Buscar nova passagem');
  await expect(page.getByText(/saindo de Rio de Janeiro/)).toBeVisible();
});
