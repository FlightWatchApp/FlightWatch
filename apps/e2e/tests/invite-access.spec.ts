import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { DATABASE_URL, INVITE_WEB_URL } from '../env';
import {
  PASSWORD,
  firstLink,
  monitorFirstOffer,
  newEmail,
  searchSaoPauloRio,
  waitForEmail,
} from './helpers';

// SPEC-043: tudo aqui roda na segunda pilha (INVITE_REQUIRED=true, cota mensal de 2).
test.use({ baseURL: INVITE_WEB_URL });

const root = resolve(import.meta.dirname, '../../..');
const CODE = /(?:[2-9A-Z]{5}-){4}[2-9A-Z]{5}/;

/** O comando do servidor, do jeito que o dono usa no primeiro acesso. */
function adminCli(...args: string[]): string {
  return execFileSync('node', ['apps/api/dist/cli/admin.js', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL, WEB_BASE_URL: INVITE_WEB_URL },
  });
}

function isoDateInDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

async function fillPasswordsAndSubmit(page: Page): Promise<void> {
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirmar senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Criar conta' }).click();
}

test('convite: chave pelo terminal, admin gera outra, cadastro, cota e suspensão', async ({
  page,
  context,
}) => {
  // 1. Primeiro acesso do dono: chave pelo terminal e link com a chave no fragmento.
  const ownerEmail = newEmail('dono');
  const output = adminCli('invite', '--email', ownerEmail);
  const ownerLink = /Link: (\S+)/.exec(output)?.[1];
  if (!ownerLink) throw new Error(`comando sem link: ${output}`);

  // Sem chave ou com chave errada, o cadastro recusa com a mensagem única.
  await page.goto('/register');
  await page.getByLabel('Email', { exact: true }).fill(ownerEmail);
  await page.getByLabel('Chave de acesso').fill('AAAAA-BBBBB-CCCCC-DDDDD-EEEEE');
  await fillPasswordsAndSubmit(page);
  await expect(page.getByText('Chave de acesso inválida, vencida ou já usada.')).toBeVisible();

  // O link preenche e-mail e chave e limpa o fragmento da barra de endereço (AC-11).
  await page.goto(ownerLink);
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(ownerEmail);
  await expect(page.getByLabel('Chave de acesso')).not.toHaveValue('');
  await expect(page).toHaveURL(/\/register$/);
  await fillPasswordsAndSubmit(page);
  await expect(page).toHaveURL(/\/$/);

  // Quem não é admin não vê a área (404), nem o link no cabeçalho.
  const denied = await page.goto('/admin/convites');
  expect(denied?.status()).toBe(404);
  await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);

  // 2. O dono vira admin só pelo comando no servidor.
  adminCli('promote', '--email', ownerEmail);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible();

  // 3. Admin gera a chave pelo site.
  const friendEmail = newEmail('amiga');
  await page.goto('/admin/convites');
  await page.getByLabel('E-mail da pessoa').fill(friendEmail);
  await page.getByRole('button', { name: 'Gerar chave' }).click();
  const box = page
    .getByRole('alert')
    .or(page.getByRole('status'))
    .filter({
      hasText: `Chave para ${friendEmail}`,
    });
  await expect(box).toBeVisible();
  const shownCode = CODE.exec((await box.textContent()) ?? '')?.[0];
  if (!shownCode) throw new Error('a chave não apareceu na tela');
  await expect(page.getByRole('row', { name: new RegExp(friendEmail) })).toContainText(
    'Disponível',
  );

  // 4. A pessoa abre o link do e-mail (AC-11) e cria a conta.
  const mail = await waitForEmail(friendEmail, 'chave de acesso');
  expect(mail.textBody).toContain(shownCode);
  const friendLink = firstLink(mail);
  expect(friendLink).toContain(`#convite=${shownCode.replaceAll('-', '')}`);

  await context.clearCookies();
  await page.goto(friendLink);
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(friendEmail);
  await fillPasswordsAndSubmit(page);
  await expect(page).toHaveURL(/\/$/);

  // A mesma chave não serve duas vezes.
  await context.clearCookies();
  await page.goto(friendLink);
  await fillPasswordsAndSubmit(page);
  await expect(page.getByText('Chave de acesso inválida, vencida ou já usada.')).toBeVisible();

  // 5. Cota mensal (2): o terceiro monitoramento é recusado (AC-8).
  await context.clearCookies();
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(friendEmail);
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/$/);

  // O monitoramento exige o e-mail confirmado.
  const verification = await waitForEmail(friendEmail, 'Confirme');
  await page.goto(firstLink(verification));
  await expect(page.getByRole('heading', { name: 'E-mail confirmado' })).toBeVisible();

  await searchSaoPauloRio(page, isoDateInDays(40));
  await monitorFirstOffer(page);
  await searchSaoPauloRio(page, isoDateInDays(41));
  await monitorFirstOffer(page);

  await searchSaoPauloRio(page, isoDateInDays(42));
  await page.getByRole('button', { name: 'Monitorar preço' }).first().click();
  await page
    .getByRole('dialog', { name: 'Monitorar este preço' })
    .getByRole('button', { name: 'Confirmar monitoramento' })
    .click();
  await expect(page.getByText(/Você já criou os 2 monitoramentos deste mês/)).toBeVisible();

  // 6. Admin suspende: a pessoa não entra mais (AC-10).
  await context.clearCookies();
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(ownerEmail);
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/admin/pessoas');
  const row = page.getByRole('row', { name: new RegExp(friendEmail) });
  await expect(row).toContainText('2 de 2');
  await row.getByRole('button', { name: 'Suspender' }).click();
  await page
    .getByRole('dialog', { name: 'Suspender o acesso?' })
    .getByRole('button', { name: 'Suspender' })
    .click();
  await expect(row).toContainText('Suspenso');

  await context.clearCookies();
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(friendEmail);
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Seu acesso está suspenso.')).toBeVisible();
});
