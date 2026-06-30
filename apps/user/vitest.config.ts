import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    // Default environment is node; jsdom is selected per-file via
    // the `// @vitest-environment jsdom` docblock comment (environmentMatchGlobs
    // was removed in Vitest 2.x — use per-file docblocks instead).
    environment: "node",
    // Playwright E2E specs live in e2e/ — exclude them from Vitest
    exclude: ["e2e/**", "**/node_modules/**"],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "app/api/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.d.ts"],
      reporter: ["text", "lcov"],
    },
    // Ensure @quickload/shared TypeScript sources are transformed
    server: {
      deps: {
        inline: ["@quickload/shared"],
      },
    },
  },
});
