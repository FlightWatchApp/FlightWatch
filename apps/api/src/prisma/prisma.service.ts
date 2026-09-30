import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { type PrismaClient, createPrismaClient } from '@flight-watch/database';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient = createPrismaClient();

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
