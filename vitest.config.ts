import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["adapters/**", "node_modules/**", "dist/**"],
  },
});
