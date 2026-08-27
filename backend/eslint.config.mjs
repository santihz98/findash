// @ts-check
import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  eslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      sourceType: 'commonjs',
      parserOptions: {
        project: './tsconfig.json',
      },
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      // Node 22+ expone globals de la Fetch API (Body, Headers, Request,
      // Response) que colisionan por nombre con decorators/tipos muy
      // comunes de Nest (@Body(), etc). TypeScript ya cubre la redeclaración
      // real de variables; esta regla del entorno base solo produce falsos
      // positivos acá.
      'no-redeclare': 'off',
      // Convención estándar de TS: un parámetro/variable destructurado con
      // prefijo `_` es intencionalmente descartado (ej. `({ userId: _userId,
      // ...rest }) => rest` para omitir un campo), no una variable olvidada.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // `no-undef` de ESLint base no entiende namespaces de tipos de TS
      // (ej. `NodeJS.Timeout`) — los marca como "variable no definida"
      // aunque sean válidos y typecheckeados por tsc. TypeScript ya cubre
      // esto (y lo cubre mejor); el estándar recomendado por
      // typescript-eslint es apagar esta regla en archivos .ts.
      'no-undef': 'off',
    },
  },
  prettier,
  {
    ignores: ['dist/', 'node_modules/', 'coverage/'],
  },
];
