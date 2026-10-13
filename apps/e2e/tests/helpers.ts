import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { MAILBOX_DIR } from '../env';

export const PASSWORD = 'senha-e2e-segura-1';

export function newEmail(prefix = 'e2e'): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@example.com`;
}

interface MailboxMessage {
  to: string;
  subject: string;
  textBody: string;
}

async function readMailbox(): Promise<MailboxMessage[]> {
  let files: string[];
  try {
    files = await readdir(MAILBOX_DIR);
  } catch {
    return [];
  }
  const messages = await Promise.all(
    files
      .filter((file) => file.endsWith('.json'))
      .map(async (file) => JSON.parse(await readFile(join(MAILBOX_DIR, file), 'utf8'))),
  );
  return messages as MailboxMessage[];
}

/** Espera chegar um e-mail para o endereço cujo assunto contenha o trecho. */
export async function waitForEmail(to: string, subjectPart: string): Promise<MailboxMessage> {
  let found: MailboxMessage | undefined;
  await expect
    .poll(
      async () => {
        found = (await readMailbox()).find(
          (message) => message.to === to && message.subject.includes(subjectPart),
        );
        return found !== undefined;
      },
      {
        timeout: 60_000,
        intervals: [500, 1000, 2000],
        message: `e-mail "${subjectPart}" para ${to}`,
      },
    )
    .toBe(true);
  if (!found) throw new Error(`e-mail "${subjectPart}" para ${to} não chegou`);
  return found;
}

/** Primeiro link http do corpo do e-mail. */
export function firstLink(message: MailboxMessage): string {
  const match = /https?:\/\/\S+/.exec(message.textBody);
  if (!match) throw new Error(`e-mail sem link: ${message.subject}`);
  return match[0];
}

export async function register(page: Page, email: string): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirmar senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/$/);
}

export async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/$/);
}

function isoDateInDays(days: number): string {
  const date = new Date(Date.now() + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

async function chooseCity(form: Locator, label: string, query: string, optionName: RegExp) {
  await form.getByRole('combobox', { name: label }).fill(query);
  await form.getByRole('option', { name: optionName }).first().click();
}

/** Busca SP → Rio (simulado) e devolve com os resultados na tela. */
export async function searchSaoPauloRio(page: Page): Promise<void> {
  await page.goto('/search');
  // O diálogo "Criar monitoramento" também mora na página: escopo no formulário da busca.
  const form = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Buscar passagens' }),
  });
  await chooseCity(form, 'Origem', 'São Paulo', /São Paulo/);
  await chooseCity(form, 'Destino', 'Rio de Janeiro', /Rio de Janeiro/);
  await form.getByLabel('Data de ida').fill(isoDateInDays(40));
  await form.getByRole('button', { name: 'Buscar passagens' }).click();
  await expect(page).toHaveURL(/searchId=/);
}

/** Do resultado da busca: abre "Monitorar preço" na primeira oferta e confirma. */
export async function monitorFirstOffer(page: Page, desiredPrice: string): Promise<void> {
  await page.getByRole('button', { name: 'Monitorar preço' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Monitorar este preço' });
  await dialog.getByLabel('Preço desejado').fill(desiredPrice);
  await dialog.getByRole('button', { name: 'Confirmar monitoramento' }).click();
  await expect(page.getByRole('dialog', { name: 'Monitoramento criado' })).toBeVisible();
}

/** Cadastra e confirma o e-mail pelo link da caixa de saída; termina na página inicial, logado. */
export async function registerVerified(page: Page, email: string): Promise<void> {
  await register(page, email);
  const mail = await waitForEmail(email, 'Confirme');
  await page.goto(firstLink(mail));
  await expect(page.getByRole('heading', { name: 'E-mail confirmado' })).toBeVisible();
}
