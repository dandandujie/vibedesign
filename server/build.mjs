// Cross-platform server bundle: esbuild → dist/server.cjs, then copy the
// brain (prompt + skills) next to it so the bundle finds it at runtime.
import { build } from "esbuild";
import { rmSync, cpSync, readFileSync } from "node:fs";

const rootVersion = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist/server.cjs",
  logOverride: { "empty-import-meta": "silent" }, // guarded by typeof __dirname
  define: { __APP_VERSION__: JSON.stringify(rootVersion) },
});

rmSync("dist/brain", { recursive: true, force: true });
cpSync("brain", "dist/brain", { recursive: true });
console.log("[bundle] dist/server.cjs + dist/brain ready");
