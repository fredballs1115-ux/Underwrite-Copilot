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
  // A few tests server-render app components (plain React on pure math) to
  // catch runtime errors in their markup; the app's tsconfig leaves JSX to
  // Next ("preserve"), so the test runner compiles it itself.
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
      // The workbook generator imports "server-only" (a Next guard). In the
      // pure-function test runner there is no server boundary, so stub it.
      "server-only": resolve(__dirname, "scripts/worker-server-only-shim.mjs"),
    },
  },
});
