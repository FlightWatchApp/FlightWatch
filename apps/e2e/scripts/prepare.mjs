// Cria o banco do E2E do zero, aplica as migrações e limpa o db 9 do Redis.
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { Redis } from 'ioredis';
import { createPrismaClient } from '@flight-watch/database';

const root = resolve(import.meta.dirname, '../../..');
const base = process.env.E2E_PG_BASE_URL ?? 'postgresql://flight_watch:flight_watch@127.0.0.1:5432';
const dbName = 'flight_watch_e2e';
const redisUrl = process.env.E2E_REDIS_URL ?? 'redis://127.0.0.1:6379/9';

const admin = createPrismaClient(`${base}/postgres`);
try {
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.$executeRawUnsafe(`CREATE DATABASE ${dbName}`);
} finally {
  await admin.$disconnect();
}

execFileSync('pnpm', ['--filter', '@flight-watch/database', 'prisma:deploy'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: `${base}/${dbName}` },
});

const redis = new Redis(redisUrl);
await redis.flushdb();
redis.disconnect();

rmSync(resolve(import.meta.dirname, '../.mailbox'), { recursive: true, force: true });
console.log('E2E: banco, Redis e caixa de e-mails prontos.');
