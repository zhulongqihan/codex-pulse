import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/demo/**/*.test.ts"],
    maxWorkers: 1,
  },
});
