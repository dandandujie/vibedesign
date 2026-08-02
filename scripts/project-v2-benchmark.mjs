import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
execFileSync(
  process.execPath,
  [join(root, "server", "node_modules", "tsx", "dist", "cli.mjs"), join(root, "scripts", "project-v2-benchmark.ts")],
  { cwd: root, stdio: "inherit" },
);
