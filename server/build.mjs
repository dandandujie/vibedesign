// Cross-platform server bundle: esbuild → dist/server.cjs, then copy the
// brain (prompt + skills) next to it so the bundle finds it at runtime.
import { build } from "esbuild";
import { rmSync, cpSync } from "node:fs";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist/server.cjs",
  logOverride: { "empty-import-meta": "silent" }, // guarded by typeof __dirname
});

rmSync("dist/brain", { recursive: true, force: true });
cpSync("brain", "dist/brain", { recursive: true });
console.log("[bundle] dist/server.cjs + dist/brain ready");
