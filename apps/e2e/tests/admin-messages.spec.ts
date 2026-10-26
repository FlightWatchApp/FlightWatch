import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { DATABASE_URL, WEB_URL } from '../env';
import { newEmail, registerVerified } from './helpers';

const root = resolve(import.meta.dirname, '../../..');

/** O comando do servidor: a única forma de alguém virar admin (SPEC-043). */
function promote(email: string): void {
  execFileSync('node', ['apps/api/dist/cli/admin.js', 'promote', '--email', email], {
    cwd: root,
    env: { ...process.env, DATABASE_URL, WEB_BASE_URL: WEB_URL },
  });
}

// SPEC-045 parte B: mensagens prontas das promoções para colar no grupo.
test('só o admin vê as mensagens do grupo, com o texto pronto e o botão de copiar', async ({
  page,
}) => {
  const email = newEmail('group-msg');
  await registerVerified(page, email);

  // Antes de virar admin: a área não existe (404), como as outras páginas de admin.
  const denied = await page.goto('/admin/mensagens');
  expect(denied?.status()).toBe(404);

  promote(email);
  await page.goto('/admin/mensagens?origin=SAO');
  await expect(page.getByRole('heading', { name: 'Mensagens para o grupo' })).toBeVisible();

  const first = page.getByRole('article').first();
  await expect(first).toContainText('São Paulo →');
  await expect(first).toContainText('Visto há');
  await expect(first).toContainText('o site mostra os voos de agora e o valor pode ser diferente');
  await expect(first).toContainText('https://');
  await expect(first.getByRole('button', { name: 'Copiar mensagem' })).toBeVisible();

  // Código de cidade inválido volta para a origem padrão, sem quebrar.
  await page.goto('/admin/mensagens?origin=%3Cscript%3E');
  await expect(page.getByRole('heading', { name: 'Mensagens para o grupo' })).toBeVisible();
});
