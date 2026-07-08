// Bundle the worker (worker/index.ts → dist/worker/index.mjs).
//
// Why a bundle step at all: the worker shares the web app's lib/ modules,
// which use the `@/…` path alias and the `server-only` guard — plain `node`
// can run neither. esbuild rewrites the aliases and shims the guard (see
// worker-server-only-shim.mjs); node_modules stay external, resolved at
// runtime like any Node app, so nothing heavy is inlined.
//
//   npm run build:worker   → build
//   npm run start:worker   → node dist/worker/index.mjs
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

await build({
  entryPoints: [path.join(root, "worker/index.ts")],
  outfile: path.join(root, "dist/worker/index.mjs"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  // Keep every npm package external — only the repo's own TS is bundled.
  packages: "external",
  alias: {
    "@": root,
    "server-only": path.join(root, "scripts/worker-server-only-shim.mjs"),
  },
  // Readable stack traces from production logs.
  sourcemap: "inline",
  logLevel: "info",
});
