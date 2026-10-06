import { Global, Module } from '@nestjs/common';
import { apiConfig, loadConfig, type LoadedConfig } from '@flight-watch/config';

export type ApiConfig = LoadedConfig<typeof apiConfig.shape>;

export const API_CONFIG = Symbol('API_CONFIG');

/**
 * SPEC-024: a configuração da API como provider global. Lida quando o módulo é
 * montado (não no import), para os testes e2e poderem definir DATABASE_URL
 * antes de compilar o app. `main.ts` já valida antes do Nest subir, então em
 * produção um erro aparece antes de qualquer módulo existir.
 */
@Global()
@Module({
  providers: [{ provide: API_CONFIG, useFactory: () => loadConfig(apiConfig, process.env) }],
  exports: [API_CONFIG],
})
export class ConfigModule {}
