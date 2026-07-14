import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Unit tests for the deterministic business-math layer (underwriting engine,
// reconciliation deltas, mandate-fit scoring). These are pure functions — no
// Next runtime, no network, no LLM. The `@/` alias mirrors tsconfig so tests
// import the same modules the app does.
export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
      // The workbook generator imports "server-only" (a Next guard). In the
      // pure-function test runner there is no server boundary, so stub it.
      "server-only": resolve(__dirname, "scripts/worker-server-only-shim.mjs"),
    },
  },
});
