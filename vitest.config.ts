import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Match tsconfig.client.json and the production client build when rendering JSX.
  esbuild: { jsx: 'automatic' },
});
