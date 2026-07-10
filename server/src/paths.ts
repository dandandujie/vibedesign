import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// Works in both runtimes: tsx dev (ESM, import.meta.url) and the esbuild CJS
// bundle inside Electron (__dirname). The ternary short-circuits so the dead
// branch never evaluates.
export const moduleDir: string =
  typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url));

// Writable data dir: Electron passes VD_DATA_DIR (userData); dev falls back
// to server/.data next to the sources.
export function dataDir(fallback: string): string {
  return process.env.VD_DATA_DIR ?? fallback;
}
