import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["packages/**/*.test.{ts,mjs}", "benchmark/**/*.test.ts", "scripts/**/*.test.mjs"] } });
