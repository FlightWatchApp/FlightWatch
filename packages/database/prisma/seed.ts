/**
 * ⚠️ STUB DE DESENVOLVIMENTO — NÃO É PARA PRODUÇÃO.
 *
 * Cria um usuário e um canal de e-mail verificado com IDs fixos, pra ter uma
 * conta pronta pra logar localmente sem passar pelo formulário de registro
 * (SPEC-007). Senha em texto puro documentada abaixo só porque é uma conta
 * de desenvolvimento local, descartável — nunca faça isso para uma conta real.
 * Idempotente: rodar de novo não duplica nada.
 */
import { createPrismaClient } from '../src/client.js';

export const DEV_USER_ID = '00000000-0000-4000-8000-000000000001';
export const DEV_USER_EMAIL = 'dev-local@example.com';
export const DEV_USER_PASSWORD = 'dev-local-password-123';
export const DEV_NOTIFICATION_CHANNEL_ID = '00000000-0000-4000-8000-000000000002';

// Hash Argon2id pré-computado de DEV_USER_PASSWORD (via @node-rs/argon2, mesma
// lib de apps/api/src/auth/password-hash.ts) — evita que esse pacote de acesso
// a dados precise da dependência de hashing só por causa do seed.
const DEV_USER_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$FVXq1D9M+sk/YR1LA9vfIA$Vqlnkmniiee/1wbRvyBbWddtOnJN+IBM9UqPLm+03nE';

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  try {
    await prisma.user.upsert({
      where: { id: DEV_USER_ID },
      update: { passwordHash: DEV_USER_PASSWORD_HASH },
      create: {
        id: DEV_USER_ID,
        email: DEV_USER_EMAIL,
        status: 'ACTIVE',
        timezone: 'America/Campo_Grande',
        passwordHash: DEV_USER_PASSWORD_HASH,
      },
    });

    await prisma.notificationChannel.upsert({
      where: { id: DEV_NOTIFICATION_CHANNEL_ID },
      update: {},
      create: {
        id: DEV_NOTIFICATION_CHANNEL_ID,
        userId: DEV_USER_ID,
        type: 'EMAIL',
        destination: DEV_USER_EMAIL,
        status: 'ACTIVE',
        verifiedAt: new Date(),
      },
    });

    console.log(`[seed] dev user ready: ${DEV_USER_ID} (${DEV_USER_EMAIL})`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
