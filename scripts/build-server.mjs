import { build } from "esbuild";
await build({
  entryPoints: { "server/index": "src/server/server.ts", "cli/index": "src/cli/index.ts" },
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  packages: "external",
  alias: { "#wallet-crypto": "./src/shared/crypto-entry.ts" },
  sourcemap: true,
});
