import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assembleProjectDesignContext,
  assembleProjectGenerationContext,
  assertProjectGenerationFiles,
  parseProjectGenerationResult,
  parseProjectFileReplacements,
} from "../src/projectContext";
import { ProjectRepository, ProjectRepositoryError } from "../src/projectRepository";

test("project design context includes only the target page, tokens, proposal, and related flows", () => {
  const root = mkdtempSync(join(tmpdir(), "vibedesign-context-"));
  try {
    const workspace = join(root, "workspace");
    mkdirSync(workspace);
    const repository = new ProjectRepository(join(root, "data", "project-index.json"));
    const created = repository.create({
      parentDirectory: workspace,
      name: "Context project",
      platform: "web",
      proposal: {
        brief: "Design a focused project manager.",
        pageTitles: ["工作台", "项目详情"],
        primaryFlowName: "查看项目",
        strategy: "flow-deepening",
      },
    });
    const context = assembleProjectDesignContext(repository, created.manifest.id, created.manifest.pages[1].id);
    assert.match(context, /Design a focused project manager/);
    assert.match(context, /项目详情/);
    assert.match(context, /工作台 → 项目详情/);
    assert.match(context, /--color-canvas/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("project generation parser validates executable flow commands", () => {
  const parsed = parseProjectGenerationResult(JSON.stringify({
    files: [{ path: "pages/index.html", content: "<button>继续</button>" }],
    flowSteps: [{
      stepId: "step-1",
      commands: [
        { type: "open" },
        { type: "click", target: { by: "role", value: "button", name: "继续" } },
      ],
    }],
  }));
  assert.equal(parsed.flowSteps?.[0].commands[1].type, "click");
  assert.throws(
    () => parseProjectGenerationResult(JSON.stringify({
      files: [{ path: "pages/index.html", content: "<button>继续</button>" }],
      flowSteps: [{ stepId: "step-1", commands: [{ type: "eval", value: "alert(1)" }] }],
    })),
    (error) => error instanceof ProjectRepositoryError && error.code === "INVALID_PROJECT",
  );
});

test("project replacement parser accepts fenced JSON and rejects prose", () => {
  assert.deepEqual(
    parseProjectFileReplacements('```json\n{"files":[{"path":"pages/index.html","content":"<h1>Hi</h1>"}]}\n```'),
    [{ path: "pages/index.html", content: "<h1>Hi</h1>" }],
  );
  assert.throws(
    () => parseProjectFileReplacements("I changed the page."),
    (error) => error instanceof ProjectRepositoryError && error.code === "INVALID_PROJECT",
  );
});

test("project generation context limits global drafts and flow deepening to their declared pages", () => {
  const root = mkdtempSync(join(tmpdir(), "vibedesign-generation-context-"));
  try {
    const workspace = join(root, "workspace");
    mkdirSync(workspace);
    const repository = new ProjectRepository(join(root, "data", "project-index.json"));
    const created = repository.create({
      parentDirectory: workspace,
      name: "Scoped generation",
      platform: "web",
      proposal: {
        brief: "Design a small product surface.",
        pageTitles: ["首页", "详情", "设置"],
        primaryFlowName: "查看详情",
        strategy: "global-draft",
      },
    });
    const global = assembleProjectGenerationContext(repository, created.manifest.id, { mode: "global-draft" });
    assert.deepEqual(global.pagePaths, created.manifest.pages.map((page) => page.path));
    assert.match(global.context, /首页/);
    assertProjectGenerationFiles(global, global.pagePaths.map((path) => ({ path, content: "<main />" })));
    assert.throws(
      () => assertProjectGenerationFiles(global, [{ path: global.pagePaths[0], content: "<main />" }]),
      (error) => error instanceof ProjectRepositoryError && error.code === "INVALID_PROJECT",
    );

    const flow = created.manifest.flows[0];
    const shortened = repository.removePage(created.manifest.id, created.manifest.pages[2].id, true);
    const deepening = assembleProjectGenerationContext(repository, shortened.manifest.id, {
      mode: "flow-deepening",
      flowId: flow.id,
    });
    assert.deepEqual(deepening.pagePaths, shortened.manifest.flows[0].steps.map((step) => shortened.manifest.pages.find((page) => page.id === step.pageId)!.path));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
