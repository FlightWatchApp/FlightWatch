// @ts-check
import eslint from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/.next/**'],
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Fronteiras entre pacotes (AGENTS.md › Regras de ouro): cada pacote expõe uma
    // superfície pública pequena; ninguém importa arquivo interno de outro.
    files: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.ts', 'packages/*/prisma/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@flight-watch/*/*'],
              message: 'Importe só a entrada pública do pacote (@flight-watch/<pacote>).',
            },
          ],
        },
      ],
    },
  },
  {
    // Domínio e contratos não conhecem framework, banco, fila nem interface
    // (CLAUDE.md §4.1, hoje docs/ENGINEERING.md §4.1).
    files: ['packages/domain/src/**/*.ts', 'packages/contracts/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@flight-watch/*/*'],
              message: 'Importe só a entrada pública do pacote (@flight-watch/<pacote>).',
            },
            {
              group: [
                '@nestjs/*',
                '@prisma/*',
                'prisma',
                'bullmq',
                'ioredis',
                'react',
                'react-dom',
                'next',
                'next/*',
                '@flight-watch/database',
                '@flight-watch/queue',
                '@flight-watch/providers',
                '@flight-watch/notifications',
                '@flight-watch/observability',
                '@flight-watch/config',
              ],
              message:
                'Domínio e contratos são puros: sem framework, banco, fila, interface ou adapter.',
            },
          ],
        },
      ],
    },
  },
  {
    // Logs só pelo logger estruturado (logEvent, com redação de dados pessoais).
    // console fica para testes, scripts e o comando `admin` do servidor.
    files: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.ts'],
    ignores: [
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/__benchmarks__/**',
      'apps/api/src/cli/**',
      'packages/observability/src/logger.ts',
    ],
    rules: { 'no-console': 'error' },
  },
  {
    // NestJS: classes injetáveis usadas só como tipo de parâmetro de construtor
    // (ex.: `constructor(private readonly x: FooService)`) ainda precisam de um
    // import de VALOR — o Nest resolve a injeção em tempo de execução lendo
    // `design:paramtypes`, que o TypeScript só emite se a classe existir como
    // referência real no JS compilado. `consistent-type-imports` não enxerga essa
    // necessidade e converteria para `import type`, quebrando a injeção em
    // silêncio (aconteceu de verdade ao rodar --fix; ver commit history).
    files: ['apps/api/src/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
  {
    // apps/e2e/scripts: script Node puro (.mjs), fora do TypeScript.
    files: ['apps/e2e/scripts/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
  {
    // apps/web: componentes React (JSX) precisam de regras de acessibilidade e de hooks,
    // que não se aplicam ao resto do monorepo (backend puro, sem JSX).
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: {
      'jsx-a11y': jsxA11y,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      ...(jsxA11y.flatConfigs?.recommended?.rules ?? {}),
      ...(reactHooks.configs?.recommended?.rules ?? {}),
    },
  },
);
