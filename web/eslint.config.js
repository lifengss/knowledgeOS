import js from '@eslint/js';
import globals from 'globals';
import { readFileSync } from 'fs';

const globalsJson = JSON.parse(readFileSync('.eslint-globals.json', 'utf-8'));
const customGlobals = {};
Object.entries(globalsJson.globals).forEach(([k, v]) => {
  customGlobals[k] = v === 'writable';
});

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...customGlobals,
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { vars: 'all', args: 'none' }],
    },
  },
];
