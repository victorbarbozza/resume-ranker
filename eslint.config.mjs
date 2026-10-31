import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier/flat'
import jsdoc from 'eslint-plugin-jsdoc'

const topLevelDeclarations = [
  'Program > ExportNamedDeclaration[declaration]',
  'Program > ExportDefaultDeclaration',
  'Program > FunctionDeclaration',
  'Program > VariableDeclaration',
  'Program > ClassDeclaration',
  'Program > TSTypeAliasDeclaration',
  'Program > TSInterfaceDeclaration',
]

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            ['parent', 'sibling', 'index'],
          ],
          pathGroups: [{ pattern: '@/**', group: 'internal' }],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },
  {
    files: [
      'src/components/**',
      'src/hooks/**',
      'src/services/**',
      'src/lib/**',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/server/**'],
              allowTypeImports: true,
              message:
                'Client code can import types from src/server, never modules.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.ts'],
    plugins: { jsdoc },
    rules: {
      'jsdoc/require-jsdoc': [
        'error',
        {
          require: {
            FunctionDeclaration: false,
            ArrowFunctionExpression: false,
            FunctionExpression: false,
            ClassDeclaration: false,
            MethodDefinition: false,
          },
          contexts: topLevelDeclarations,
        },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'next-env.d.ts',
    'src/server/shared/database/migrations/**',
  ]),
])
