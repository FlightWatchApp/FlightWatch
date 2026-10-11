import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    include: ['src/**/*.spec.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Cada arquivo e2e sobe o próprio PostgreSQL (Testcontainers). Sem teto, o
    // Vitest roda um arquivo por núcleo e, somado aos outros pacotes que o
    // turbo executa em paralelo, dezenas de containers sobem juntos e estouram
    // o hookTimeout (achado ao adicionar os e2e da SPEC-029 numa máquina de 20
    // núcleos). 4 mantém a suíte rápida sem disputar recursos.
    maxWorkers: 4,
    minWorkers: 1,
    // SPEC-014: RATE_LIMIT_MAX é lido uma única vez, na primeira importação
    // de searches.module.ts (decorator @Module avaliado em tempo de classe)
    // — precisa estar em process.env ANTES de qualquer arquivo de teste
    // importar AppModule, o que só o bootstrap do worker do Vitest garante
    // (um process.env.X = ... no topo do arquivo de teste rodaria depois dos
    // imports, por hoisting de ESM). Baixo o bastante pra um teste dedicado
    // disparar 429 sem precisar de muitas requisições; alto o bastante pra
    // não colidir com o uso normal de POST /v1/searches/flights no resto da
    // suíte (nenhum outro spec chama essa rota).
    // SPEC-025: as suítes de auth criam muitas contas do mesmo IP; o limite de
    // auth fica alto aqui e rate-limit.e2e.spec.ts monta um app próprio com
    // limites baixos.
    // SPEC-032: a API passou a usar Redis (cache). Porta 1 é inalcançável: um
    // e2e nunca lê nem grava no Redis de desenvolvimento; quem precisa de
    // cache sobrescreve KEY_VALUE_STORE com o store em memória.
    env: { RATE_LIMIT_MAX: '15', AUTH_RATE_LIMIT_MAX: '1000', REDIS_URL: 'redis://127.0.0.1:1' },
  },
});
