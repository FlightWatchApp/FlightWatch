import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { type PrismaClient, createPrismaClient } from '@flight-watch/database';
import { API_CONFIG, type ApiConfig } from '../config/config.module.js';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    this.client = createPrismaClient(config.DATABASE_URL);
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
