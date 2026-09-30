import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

export function createPrismaClient(datasourceUrl?: string): PrismaClient {
  return new PrismaClient(datasourceUrl ? { datasourceUrl } : undefined);
}
