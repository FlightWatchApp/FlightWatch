import { expect, test } from '@playwright/test';
import { PASSWORD, firstLink, login, newEmail, register, waitForEmail } from './helpers';

test('cadastro, confirmação de e-mail, saída e entrada', async ({ page }) => {
  const email = newEmail('conta');
  await register(page, email);

  const mail = await waitForEmail(email, 'Confirme');
  await page.goto(firstLink(mail));
  await expect(page.getByRole('heading', { name: 'E-mail confirmado' })).toBeVisible();

  // sair e voltar
  await page.context().clearCookies();
  await login(page, email);
  await expect(page.getByText(email).first()).toBeVisible();
  expect(PASSWORD.length).toBeGreaterThanOrEqual(10);
});
