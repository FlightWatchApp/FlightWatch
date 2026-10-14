import { expect, test } from '@playwright/test';

// SPEC-037: Privacidade e Termos no rodapé de toda página e no cadastro.
test('rodapé leva à Política de Privacidade e aos Termos de Uso', async ({ page }) => {
  await page.goto('/');
  const footer = page.getByRole('navigation', { name: 'Rodapé' });

  await footer.getByRole('link', { name: 'Privacidade' }).click();
  await expect(page).toHaveURL(/\/privacidade$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Política de Privacidade');

  await footer.getByRole('link', { name: 'Termos de uso' }).click();
  await expect(page).toHaveURL(/\/termos$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Termos de Uso');
});

test('cadastro mostra os links de Termos e Privacidade', async ({ page }) => {
  await page.goto('/register');
  await expect(page.getByRole('link', { name: 'Termos de Uso', exact: true })).toHaveAttribute(
    'href',
    '/termos',
  );
  await expect(
    page.getByRole('link', { name: 'Política de Privacidade', exact: true }),
  ).toHaveAttribute('href', '/privacidade');
});
