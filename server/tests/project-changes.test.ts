import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { commitProjectChange, planProjectChange, ProjectChangeConflictError } from "../src/projectChanges";
import { ProjectRepository, ProjectRepositoryError } from "../src/projectRepository";

test("project file transaction keeps local changes local and confirms shared impact", () => {
  const root = mkdtempSync(join(tmpdir(), "vibedesign-changes-"));
  try {
    const workspace = join(root, "workspace");
    mkdirSync(workspace);
    const repository = new ProjectRepository(join(root, "data", "project-index.json"));
    const created = repository.create({
      parentDirectory: workspace,
      name: "Impact project",
      platform: "web",
      proposal: {
        brief: "Test project impact.",
        strategy: "global-draft",
        pageTitles: ["首页", "项目"],
        primaryFlowName: "查看项目",
      },
    });
    const secondPage = created.manifest.pages[1];
    const firstBefore = readFileSync(join(created.directory, "pages", "index.html"), "utf8");
    const secondHtml = "<!doctype html><html><body><h1>Changed project</h1></body></html>";

    const localPlan = planProjectChange(repository, created.manifest.id, [{ path: secondPage.path, content: secondHtml }]);
    assert.equal(localPlan.level, "local");
    assert.deepEqual(localPlan.affectedPageIds, [secondPage.id]);
    assert.equal(localPlan.requiresConfirmation, false);
    commitProjectChange(repository, created.manifest.id, [{ path: secondPage.path, content: secondHtml }]);
    assert.equal(readFileSync(join(created.directory, secondPage.path), "utf8"), secondHtml);
    assert.equal(readFileSync(join(created.directory, "pages", "index.html"), "utf8"), firstBefore);

    const tokenChange = ":root { --color-canvas: #f0eee8; }";
    const sharedPlan = planProjectChange(repository, created.manifest.id, [{ path: "tokens.css", content: tokenChange }]);
    assert.equal(sharedPlan.level, "shared");
    assert.deepEqual(sharedPlan.affectedPageIds, created.manifest.pages.map((page) => page.id));
    assert.throws(
      () => commitProjectChange(repository, created.manifest.id, [{ path: "tokens.css", content: tokenChange }]),
      (error) => error instanceof ProjectRepositoryError && error.code === "INVALID_INPUT",
    );
    const committed = commitProjectChange(
      repository,
      created.manifest.id,
      [{ path: "tokens.css", content: tokenChange }],
      sharedPlan.impactHash,
      undefined,
      () => "checkpoint",
    );
    assert.equal(committed.checkpoint, "checkpoint");
    assert.equal(readFileSync(join(created.directory, "tokens.css"), "utf8"), tokenChange);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("project file transaction rejects undeclared and unsafe local targets", () => {
  const root = mkdtempSync(join(tmpdir(), "vibedesign-changes-unsafe-"));
  try {
    const workspace = join(root, "workspace");
    mkdirSync(workspace);
    const repository = new ProjectRepository(join(root, "data", "project-index.json"));
    const created = repository.create({ parentDirectory: workspace, name: "Safe", platform: "web" });
    assert.throws(
      () => planProjectChange(repository, created.manifest.id, [{ path: "../outside.html", content: "bad" }]),
      (error) => error instanceof ProjectRepositoryError && error.code === "UNSAFE_PATH",
    );
    assert.throws(
      () => planProjectChange(repository, created.manifest.id, [{ path: "notes.txt", content: "bad" }]),
      (error) => error instanceof ProjectRepositoryError && error.code === "INVALID_INPUT",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("flow deepening marks exactly the flow pages as deepened", () => {
  const root = mkdtempSync(join(tmpdir(), "vibedesign-changes-deepening-"));
  try {
    const workspace = join(root, "workspace");
    mkdirSync(workspace);
    const repository = new ProjectRepository(join(root, "data", "project-index.json"));
    const created = repository.create({ parentDirectory: workspace, name: "Deepening", platform: "web" });
    const second = repository.addPage(created.manifest.id, { title: "详情" });
    const third = repository.addPage(created.manifest.id, { title: "设置" });
    const withFlow = repository.addFlow(created.manifest.id, {
      name: "查看详情",
      pageIds: [third.manifest.pages[0].id, second.manifest.pages[1].id],
    });
    const flow = withFlow.manifest.flows[0];
    const flowSteps = flow.steps.map((step) => ({ stepId: step.id, commands: step.commands }));
    const files = [
      { path: withFlow.manifest.pages[0].path, content: "<main>首页深化</main>" },
      { path: withFlow.manifest.pages[1].path, content: "<main>详情深化</main>" },
      { path: "tokens.css", content: ":root { --color-canvas: #eee; }" },
    ];
    const plan = planProjectChange(repository, created.manifest.id, files);
    const committed = commitProjectChange(
      repository,
      created.manifest.id,
      files,
      plan.impactHash,
      { deepenedFlowId: flow.id, flowSteps },
    );
    assert.deepEqual(committed.record.manifest.pages.map((page) => page.status), ["deepened", "deepened", "draft"]);
    assert.equal(committed.record.manifest.flows[0].status, "draft");

    const partial = [{ path: committed.record.manifest.pages[0].path, content: "<main>不完整深化</main>" }];
    const partialPlan = planProjectChange(repository, created.manifest.id, partial);
    assert.throws(
      () => commitProjectChange(repository, created.manifest.id, partial, partialPlan.impactHash, { deepenedFlowId: flow.id, flowSteps }),
      (error) => error instanceof ProjectRepositoryError && error.code === "INVALID_INPUT",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("project file transaction reports a diff instead of overwriting a concurrent edit", () => {
  const root = mkdtempSync(join(tmpdir(), "vibedesign-changes-conflict-"));
  try {
    const workspace = join(root, "workspace");
    mkdirSync(workspace);
    const repository = new ProjectRepository(join(root, "data", "project-index.json"));
    const created = repository.create({ parentDirectory: workspace, name: "Conflict", platform: "web" });
    const page = created.manifest.pages[0];
    const replacement = [{ path: page.path, content: "<main>AI proposal</main>" }];
    const plan = planProjectChange(repository, created.manifest.id, replacement);
    writeFileSync(join(created.directory, page.path), "<main>edited in IDE</main>");

    assert.throws(
      () => commitProjectChange(repository, created.manifest.id, replacement, plan.impactHash),
      (error) =>
        error instanceof ProjectChangeConflictError &&
        error.conflicts[0]?.currentContent === "<main>edited in IDE</main>" &&
        error.conflicts[0]?.proposedContent === "<main>AI proposal</main>",
    );
    assert.equal(readFileSync(join(created.directory, page.path), "utf8"), "<main>edited in IDE</main>");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
