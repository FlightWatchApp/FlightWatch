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
