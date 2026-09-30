import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    include: ['src/**/*.spec.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // SPEC-014: RATE_LIMIT_MAX é lido uma única vez, na primeira importação
    // de searches.module.ts (decorator @Module avaliado em tempo de classe)
    // — precisa estar em process.env ANTES de qualquer arquivo de teste
    // importar AppModule, o que só o bootstrap do worker do Vitest garante
    // (um process.env.X = ... no topo do arquivo de teste rodaria depois dos
    // imports, por hoisting de ESM). Baixo o bastante pra um teste dedicado
    // disparar 429 sem precisar de muitas requisições; alto o bastante pra
    // não colidir com o uso normal de POST /v1/searches/flights no resto da
    // suíte (nenhum outro spec chama essa rota).
    env: { RATE_LIMIT_MAX: '15' },
  },
});
