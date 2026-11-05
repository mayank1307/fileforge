// ESLint 9 flat config for the server, examples/ and the extension. Run with npm run lint in mcp-server/.
// The repo root has no node_modules, so dependencies resolve from mcp-server/.
import { createRequire } from 'module';

const require = createRequire(new URL('./mcp-server/package.json', import.meta.url));
const globals = require('globals');

export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.es2021, ...globals.browser, ...globals.node, ...globals.webextensions },
    },
    rules: {
      // caughtErrors: 'none' keeps ESLint 8's default; 9 started reporting unused catch parameters.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-console': 'off',
    },
  },
];
