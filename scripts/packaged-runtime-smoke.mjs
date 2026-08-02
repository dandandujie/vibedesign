import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const executable = process.argv[2] ?? join(root, "release", "win-unpacked", "Vibedesign.exe");
assert.equal(existsSync(executable), true, `packaged executable not found: ${executable}`);

function reservePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("failed to reserve packaged app port"));
      server.close((error) => error ? reject(error) : resolvePort(address.port));
    });
  });
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  assert.equal(response.ok, true, `${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function waitUntilReady(origin, child, output) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`packaged app exited with code ${child.exitCode}: ${output.join("")}`);
    try {
      const response = await fetch(`${origin}/api/meta`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`packaged app did not become ready: ${output.join("")}`);
}

const temporaryRoot = mkdtempSync(join(tmpdir(), "vibedesign-packaged-runtime-"));
const workspace = join(temporaryRoot, "workspace");
const userData = join(temporaryRoot, "user-data");
mkdirSync(workspace);
const port = await reservePort();
const origin = `http://127.0.0.1:${port}`;
const output = [];
const child = spawn(executable, [`--user-data-dir=${userData}`, "--headless", "--disable-gpu"], {
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
child.stdout?.on("data", (chunk) => output.push(chunk.toString()));
child.stderr?.on("data", (chunk) => output.push(chunk.toString()));

try {
  await waitUntilReady(origin, child, output);
  const created = await requestJson(`${origin}/api/v2/projects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      parentDirectory: workspace,
      name: "安装包运行验证",
      platform: "web",
      proposal: {
        brief: "验证正式安装内容能够运行前端体验流程。",
        strategy: "flow-deepening",
        pageTitles: ["首页"],
        primaryFlowName: "打开首页",
      },
    }),
  });
  writeFileSync(
    join(created.directory, "pages", "index.html"),
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>首页</title><link rel="stylesheet" href="../tokens.css"></head><body><main><h1>首页</h1><p>由安装包内的 Electron Chromium 验证。</p></main></body></html>`,
    "utf8",
  );
  const flowId = created.manifest.flows[0].id;
  const validated = await requestJson(`${origin}/api/v2/projects/${created.manifest.id}/flows/${flowId}/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ runCompleted: true }),
  });
  assert.equal(validated.validation.passed, true, JSON.stringify(validated.validation.checks));
  assert.deepEqual(validated.validation.checks.runtimeErrors, []);
  assert.deepEqual(validated.validation.checks.stepFailures, []);
  console.log("Packaged runtime smoke passed: installed Vibedesign reused Electron Chromium for desktop and mobile flow validation.");
} finally {
  if (child.exitCode === null) child.kill();
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    new Promise((resolveWait) => setTimeout(resolveWait, 3_000)),
  ]);
  rmSync(temporaryRoot, { recursive: true, force: true });
}
