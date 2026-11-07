import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src/pulse"),
    },
  },
  test: {
    setupFiles: ["./src/pulse/test/setup.ts"],
    include: ["src/pulse/**/*.test.{ts,tsx}"],
    // Keep jsdom interaction tests responsive when the full suite runs.
    maxWorkers: 1,
    testTimeout: 15_000,
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
