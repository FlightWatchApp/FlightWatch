import { Controller, Get, Module } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API_SECURITY_HEADERS, registerSecurityHeaders } from './security-headers.js';

@Controller('probe')
class ProbeController {
  @Get()
  get(): { ok: true } {
    return { ok: true };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('headers de segurança da API', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    registerSecurityHeaders(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('vão em respostas de sucesso e de erro', async () => {
    for (const path of ['/probe', '/nao-existe']) {
      const response = await request(app.getHttpServer()).get(path);
      for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) {
        expect(response.headers[name]).toBe(value);
      }
    }
  });
});
