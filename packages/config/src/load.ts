import { z } from 'zod';
import { enumField } from './fields.js';

/**
 * SPEC-024 — carga e validação da configuração de um processo, uma vez, no
 * startup. Reúne todos os problemas num `ConfigError` em vez de parar no
 * primeiro, para quem faz o deploy corrigir tudo de uma vez.
 */

export const APP_ENVS = ['development', 'test', 'staging', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

const NODE_ENVS = ['development', 'test', 'production'] as const;
type NodeEnv = (typeof NODE_ENVS)[number];

/** Variáveis cujo valor `simulated` é proibido com `APP_ENV=production`. */
const ADAPTER_KEYS = ['FLIGHT_PROVIDER', 'EMAIL_PROVIDER'] as const;
const SIMULATED_ADAPTER = 'simulated';

/** Só nestes ambientes valem os padrões apontando para o docker compose local. */
const LOCAL_APP_ENVS: readonly AppEnv[] = ['development', 'test'];

export type Env = Readonly<Record<string, string | undefined>>;

export interface ConfigDefinition<Shape extends z.ZodRawShape> {
  /** Nome estável do processo, igual ao `service` dos logs. */
  service: string;
  shape: Shape;
  /** Padrões aplicados só com `APP_ENV` `development` ou `test`. */
  localDefaults?: Partial<Record<keyof Shape & string, string>>;
  /**
   * Regras entre campos, rodadas depois que cada campo é válido (ex.: token
   * obrigatório só com um provedor). Mensagens sem valores (AC-6).
   */
  rules?: (values: z.output<z.ZodObject<Shape>>) => ConfigIssue[];
}

export type LoadedConfig<Shape extends z.ZodRawShape> = z.output<z.ZodObject<Shape>> & {
  NODE_ENV: NodeEnv;
  APP_ENV: AppEnv;
};

export interface ConfigIssue {
  key: string;
  message: string;
}

export class ConfigError extends Error {
  constructor(
    readonly service: string,
    readonly issues: readonly ConfigIssue[],
  ) {
    super(
      `Configuração inválida (${service}):\n` +
        issues.map((issue) => `  - ${issue.key}: ${issue.message}`).join('\n'),
    );
    this.name = 'ConfigError';
  }

  /** Campos para `logEvent` — chaves e motivos, nunca valores. */
  toLogEvent(): { event: 'config_invalid'; service: string; issues: ConfigIssue[] } {
    return { event: 'config_invalid', service: this.service, issues: [...this.issues] };
  }
}

const runtimeShape = {
  NODE_ENV: enumField(NODE_ENVS, 'development'),
  APP_ENV: z.string().optional(),
};

/** Todas as chaves que uma definição lê, incluindo as de runtime. */
export function definitionKeys(definition: { shape: z.ZodRawShape }): string[] {
  return [...Object.keys(runtimeShape), ...Object.keys(definition.shape)];
}

/** Variável vazia ou só com espaços conta como ausente. */
function withoutBlankValues(env: Env): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && value.trim() !== '') {
      result[key] = value.trim();
    }
  }
  return result;
}

function issuesOf(error: z.ZodError): ConfigIssue[] {
  return error.issues.map((issue) => ({ key: String(issue.path[0]), message: issue.message }));
}

function resolveAppEnv(
  nodeEnv: NodeEnv,
  rawAppEnv: string | undefined,
  issues: ConfigIssue[],
): AppEnv | undefined {
  if (rawAppEnv === undefined) {
    if (nodeEnv === 'production') {
      issues.push({ key: 'APP_ENV', message: 'obrigatória quando NODE_ENV=production' });
      return undefined;
    }
    return nodeEnv;
  }
  if (!(APP_ENVS as readonly string[]).includes(rawAppEnv)) {
    issues.push({ key: 'APP_ENV', message: `deve ser um de: ${APP_ENVS.join(', ')}` });
    return undefined;
  }
  return rawAppEnv as AppEnv;
}

export function loadConfig<Shape extends z.ZodRawShape>(
  definition: ConfigDefinition<Shape>,
  rawEnv: Env,
): LoadedConfig<Shape> {
  const env = withoutBlankValues(rawEnv);
  const issues: ConfigIssue[] = [];

  const runtime = z.object(runtimeShape).safeParse(env);
  if (!runtime.success) {
    issues.push(...issuesOf(runtime.error));
  }
  const nodeEnv = runtime.success ? runtime.data.NODE_ENV : undefined;
  const appEnv = nodeEnv ? resolveAppEnv(nodeEnv, runtime.data?.APP_ENV, issues) : undefined;

  // Com APP_ENV não resolvido o erro dele já impede o startup; aplicar os
  // padrões locais evita acusar também "DATABASE_URL obrigatória" etc., que
  // não é a causa real.
  const useLocalDefaults = appEnv === undefined || LOCAL_APP_ENVS.includes(appEnv);
  const withDefaults = useLocalDefaults ? { ...definition.localDefaults, ...env } : env;
  const parsed = z.object(definition.shape).safeParse(withDefaults);
  if (!parsed.success) {
    issues.push(...issuesOf(parsed.error));
  }

  // SPEC-025: padrão local copiado para staging/produção (senha do compose,
  // segredo de desenvolvimento) é erro, mesmo informado explicitamente.
  if (appEnv && !LOCAL_APP_ENVS.includes(appEnv)) {
    for (const [key, localValue] of Object.entries(definition.localDefaults ?? {})) {
      if (env[key] !== undefined && env[key] === localValue) {
        issues.push({
          key,
          message: 'não pode usar o valor de desenvolvimento fora de development/test',
        });
      }
    }
  }

  if (parsed.success && definition.rules) {
    issues.push(...definition.rules(parsed.data));
  }

  if (appEnv === 'production' && parsed.success) {
    const values = parsed.data as Record<string, unknown>;
    for (const key of ADAPTER_KEYS) {
      if (key in definition.shape && values[key] === SIMULATED_ADAPTER) {
        issues.push({
          key,
          message: 'adapter simulado não é permitido com APP_ENV=production',
        });
      }
    }
  }

  if (issues.length > 0 || !parsed.success || !nodeEnv || !appEnv) {
    throw new ConfigError(definition.service, issues);
  }
  return { ...parsed.data, NODE_ENV: nodeEnv, APP_ENV: appEnv } as LoadedConfig<Shape>;
}
