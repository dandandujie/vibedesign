import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsxCli = join(serverRoot, "node_modules", "tsx", "dist", "cli.mjs");

async function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("failed to reserve a TCP port"));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForServer(baseUrl: string, child: ChildProcessWithoutNullStreams, logs: () => string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited with ${child.exitCode}\n${logs()}`);
    try {
      const response = await fetch(`${baseUrl}/api/meta`);
      if (response.ok) return;
    } catch {
      // The child has not bound the port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server did not become ready\n${logs()}`);
}

test("project API persists a project inside an isolated data directory", async (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), "vibedesign-api-"));
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let output = "";
  const child = spawn(process.execPath, [tsxCli, "src/index.ts"], {
    cwd: serverRoot,
    env: { ...process.env, PORT: String(port), VD_DATA_DIR: dataDir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  t.after(() => {
    child.kill();
    rmSync(dataDir, { recursive: true, force: true });
  });

  await waitForServer(baseUrl, child, () => output);

  const empty = await fetch(`${baseUrl}/api/projects`).then((response) => response.json());
  assert.deepEqual(empty, []);

  const project = {
    id: "smoke-project",
    name: "Smoke project",
    messages: [],
    artifacts: [],
    comments: [],
    updatedAt: 0,
  };
  const savedResponse = await fetch(`${baseUrl}/api/projects/${project.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(project),
  });
  assert.equal(savedResponse.status, 200);

  const saved = (await fetch(`${baseUrl}/api/projects/${project.id}`).then((response) => response.json())) as {
    id: string;
    name: string;
    updatedAt: number;
  };
  assert.equal(saved.id, project.id);
  assert.equal(saved.name, project.name);
  assert.ok(saved.updatedAt > 0);

  const listed = (await fetch(`${baseUrl}/api/projects`).then((response) => response.json())) as { id: string }[];
  assert.deepEqual(listed.map((item) => item.id), [project.id]);

  const deleted = await fetch(`${baseUrl}/api/projects/${project.id}`, { method: "DELETE" });
  assert.equal(deleted.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/projects/${project.id}`)).status, 404);

  const workspace = join(dataDir, "workspace");
  mkdirSync(workspace);
  const designSystemResponse = await fetch(`${baseUrl}/api/design-systems/api-test-system`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "api-test-system",
      name: "API test system",
      content: "Use the brand token.",
      tokensCss: ":root { --brand: #c55f3d; }",
      updatedAt: 0,
    }),
  });
  assert.equal(designSystemResponse.status, 200);
  const createdResponse = await fetch(`${baseUrl}/api/v2/projects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      parentDirectory: workspace,
      name: "Project V2 smoke",
      folderName: "project-v2-smoke",
      platform: "web",
      settings: { designSystemId: "api-test-system" },
    }),
  });
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()) as {
    directory: string;
    manifest: { id: string; name: string; pages: { path: string }[] };
  };
  assert.equal(created.manifest.name, "Project V2 smoke");
  assert.equal(created.manifest.pages[0].path, "pages/index.html");
  assert.equal(existsSync(created.directory), true);
  assert.match(readFileSync(join(created.directory, "tokens.css"), "utf8"), /--brand: #c55f3d/);

  const v2List = (await fetch(`${baseUrl}/api/v2/projects`).then((response) => response.json())) as { id: string }[];
  assert.deepEqual(v2List.map((entry) => entry.id), [created.manifest.id]);

  const preview = await fetch(`${baseUrl}/api/v2/projects/${created.manifest.id}/files/pages/index.html`);
  assert.equal(preview.status, 200);
  assert.match(await preview.text(), /Project V2 smoke/);

  const addedPageResponse = await fetch(`${baseUrl}/api/v2/projects/${created.manifest.id}/pages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Project details", fileName: "project.html" }),
  });
  assert.equal(addedPageResponse.status, 201);
  const withPage = (await addedPageResponse.json()) as {
    manifest: { pages: { id: string }[] };
  };
  const addedPageId = withPage.manifest.pages[1].id;
  const addedFlowResponse = await fetch(`${baseUrl}/api/v2/projects/${created.manifest.id}/flows`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Open project",
      pageIds: withPage.manifest.pages.map((page) => page.id),
    }),
  });
  assert.equal(addedFlowResponse.status, 201);
  const withFlow = (await addedFlowResponse.json()) as { manifest: { flows: { steps: unknown[] }[] } };
  assert.equal(withFlow.manifest.flows[0].steps.length, 2);
  const removedPage = await fetch(
    `${baseUrl}/api/v2/projects/${created.manifest.id}/pages/${addedPageId}?cascade=true`,
    { method: "DELETE" },
  );
  assert.equal(removedPage.status, 200);

  const unindexed = await fetch(`${baseUrl}/api/v2/projects/${created.manifest.id}`, { method: "DELETE" });
  assert.equal(unindexed.status, 200);
  assert.deepEqual(await fetch(`${baseUrl}/api/v2/projects`).then((response) => response.json()), []);
  assert.equal(existsSync(created.directory), true);

  const invalid = await fetch(`${baseUrl}/api/v2/projects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      parentDirectory: workspace,
      name: "Invalid platform",
      folderName: "invalid-platform",
      platform: "watch",
    }),
  });
  assert.equal(invalid.status, 400);
  assert.equal(((await invalid.json()) as { code: string }).code, "INVALID_INPUT");

  const legacy = {
    id: "legacy-api-project",
    name: "Legacy API project",
    messages: [],
    artifacts: [
      {
        id: "v1",
        html: "<!doctype html><html><body>Legacy API migration</body></html>",
        label: "Initial",
        createdAt: 1700000000000,
        kind: "html",
      },
    ],
    activeVersionId: "v1",
    updatedAt: 1700000000000,
  };
  assert.equal(
    (
      await fetch(`${baseUrl}/api/projects/${legacy.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(legacy),
      })
    ).status,
    200,
  );
  const migrationResponse = await fetch(`${baseUrl}/api/v2/migrations/legacy`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ targetParentDirectory: workspace }),
  });
  assert.equal(migrationResponse.status, 200);
  const migration = (await migrationResponse.json()) as {
    counts: { migrated: number };
    results: { legacyProjectId: string; projectId?: string }[];
  };
  assert.equal(migration.counts.migrated, 1);
  const migrated = migration.results.find((result) => result.legacyProjectId === legacy.id);
  assert.ok(migrated?.projectId);
  assert.match(
    await fetch(`${baseUrl}/api/v2/projects/${migrated.projectId}/files/pages/index.html`).then((response) => response.text()),
    /Legacy API migration/,
  );
  const savedReport = (await fetch(`${baseUrl}/api/v2/migrations/legacy`).then((response) => response.json())) as {
    counts: { migrated: number };
  };
  assert.equal(savedReport.counts.migrated, 1);
  const safety = (await fetch(`${baseUrl}/api/v2/preview/safety`).then((response) => response.json())) as {
    migration: { backupExists: boolean; backupVerifiedAtMigration: boolean };
    diagnostics: { migration: { counts: { migrated: number } } };
  };
  assert.equal(safety.migration.backupExists, true);
  assert.equal(safety.migration.backupVerifiedAtMigration, true);
  assert.equal(safety.diagnostics.migration.counts.migrated, 1);
  const feedbackDirectory = join(dataDir, "feedback");
  mkdirSync(feedbackDirectory);
  const feedbackResponse = await fetch(`${baseUrl}/api/v2/preview/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      destinationDirectory: feedbackDirectory,
      feedback: { category: "usability", summary: "项目入口不够清晰" },
    }),
  });
  assert.equal(feedbackResponse.status, 201);
  const feedback = (await feedbackResponse.json()) as { file: string };
  const feedbackContents = readFileSync(feedback.file, "utf8");
  assert.match(feedbackContents, /项目入口不够清晰/);
  assert.doesNotMatch(feedbackContents, /Legacy API project|Legacy API migration|legacy-api-project/);
  assert.equal((await fetch(`${baseUrl}/api/projects/${legacy.id}`)).status, 200);
});
