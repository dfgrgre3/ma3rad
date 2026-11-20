import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Design-system guard: raw Tailwind palette classes (bg-rose-500, text-slate-700, ...)
 * bypass the tokens in src/styles/design-tokens.css. Use the semantic colors from
 * tailwind.config.js (primary, surface, muted, line, success, danger, warning, ...).
 */
const RAW_PALETTE_CLASS =
  /\b(?:bg|text|border|ring|from|to|via|fill|stroke|divide|placeholder|outline|decoration|accent|caret|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;

const designSystemPlugin = {
  rules: {
    'no-raw-palette-classes': {
      meta: {
        type: 'suggestion',
        messages: {
          raw: 'Raw palette class "{{cls}}". Use a semantic token from tailwind.config.js (primary, surface, muted, line, success, danger, warning, ...).',
        },
        schema: [],
      },
      create(context) {
        const check = (node, text) => {
          const match = RAW_PALETTE_CLASS.exec(text);
          if (match) context.report({ node, messageId: 'raw', data: { cls: match[0] } });
        };
        return {
          Literal(node) {
            if (typeof node.value === 'string') check(node, node.value);
          },
          TemplateElement(node) {
            check(node, node.value.raw);
          },
        };
      },
    },
  },
};

export default tseslint.config(
  { ignores: ['dist/**', 'release/**', 'node_modules/**', 'coverage/**', 'public/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'test/**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/components/ui/**', 'src/styles/**'],
    plugins: { 'cerami-design': designSystemPlugin },
    rules: {
      'cerami-design/no-raw-palette-classes': 'error',
    },
  },
  {
    files: ['electron/**/*.js', 'test/**/*.cjs', 'test/**/*.mjs'],
    languageOptions: { globals: { require: 'readonly', module: 'readonly', __dirname: 'readonly', process: 'readonly', console: 'readonly' } },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-undef': 'off',
    },
  },
);