import { defineConfig } from 'vitest/config';

// Unit tests do not need the extension build plugin or a browser environment.
export default defineConfig({
  test: { environment: 'node', clearMocks: true, include: ['tests/**/*.test.ts'] },
});
