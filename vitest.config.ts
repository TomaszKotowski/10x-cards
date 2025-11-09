import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    // Test environment
    environment: "node",

    // Global test setup
    globals: true,

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "dist/", "**/*.d.ts", "**/*.config.*", "**/test/**", "**/__tests__/**"],
    },

    // File patterns
    include: ["src/**/*.{test,spec}.{js,ts}"],

    // Setup files
    setupFiles: [],

    // Mock reset behavior
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,
  },

  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@/db": resolve(__dirname, "./src/db"),
      "@/lib": resolve(__dirname, "./src/lib"),
      "@/types": resolve(__dirname, "./src/types.ts"),
    },
  },
});
