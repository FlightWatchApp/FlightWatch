import { expect, test } from '@playwright/test';
import { PASSWORD, newEmail, register } from './helpers';

test('exclusão da conta pelo próprio usuário (anonimização) e e-mail liberado', async ({
  page,
}) => {
  const email = newEmail('exclusao');
  await register(page, email);

  await page.goto('/account');
  await page.getByLabel('Senha atual').fill(PASSWORD);
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Excluir minha conta' }).click();
  await expect(page.getByRole('heading', { name: 'Conta excluída' })).toBeVisible();

  // A sessão acabou e o e-mail volta a poder ser cadastrado.
  await page.goto('/watches');
  await expect(page).toHaveURL(/\/login/);
  await register(page, email);
});
