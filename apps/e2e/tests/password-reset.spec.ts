import { expect, test } from '@playwright/test';
import { firstLink, newEmail, register, waitForEmail } from './helpers';

test('recuperação de senha: link por e-mail, nova senha e entrada com ela', async ({ page }) => {
  const email = newEmail('reset');
  await register(page, email);
  await page.context().clearCookies();

  await page.goto('/forgot-password');
  await page.getByLabel('Email da conta').fill(email);
  await page.getByRole('button', { name: 'Enviar link' }).click();

  const mail = await waitForEmail(email, 'Redefinir');
  await page.goto(firstLink(mail));
  const novaSenha = 'outra-senha-e2e-9';
  await page.getByLabel('Nova senha', { exact: true }).fill(novaSenha);
  await page.getByLabel('Repita a nova senha').fill(novaSenha);
  await page.getByRole('button', { name: 'Definir nova senha' }).click();

  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(novaSenha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(email).first()).toBeVisible();
});
