import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import extractZip from "extract-zip";
import { PROJECT_FLOW_REVIEW_CRITERIA } from "../../shared/project";
import { validateExportedProject } from "../src/projectExportValidation";
import { ProjectRepository, ProjectRepositoryError } from "../src/projectRepository";

const acceptedReview = { acceptedCriteria: PROJECT_FLOW_REVIEW_CRITERIA.map((criterion) => criterion.id) };

function listFiles(directory: string, root = directory): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path, root) : [path.slice(root.length + 1).replace(/\\/g, "/")];
  }).sort();
}

test("ProjectRepository creates, moves, reopens, previews, and unindexes a portable project", () => {
  const root = mkdtempSync(join(tmpdir(), "vibedesign-v2-"));
  try {
    const workspace = join(root, "workspace");
    const data = join(root, "data");
    mkdirSync(workspace);
    const repository = new ProjectRepository(join(data, "project-index.json"));

    const created = repository.create({
      parentDirectory: workspace,
      name: "Project management",
      folderName: "project-management",
      platform: "web",
    });

    assert.equal(created.manifest.pages[0].path, "pages/index.html");
    assert.equal(existsSync(join(created.directory, "vibedesign.json")), true);
    assert.equal(existsSync(join(created.directory, "tokens.css")), true);
    assert.equal(existsSync(join(created.directory, ".vibedesign", "versions")), true);
    assert.deepEqual(repository.list().map((entry) => entry.id), [created.manifest.id]);

    const preview = repository.readPreviewFile(created.manifest.id, "pages/index.html");
    assert.equal(preview.contentType, "text/html; charset=utf-8");
    assert.match(preview.body.toString("utf8"), /Project management/);
    assert.throws(
      () => repository.readPreviewFile(created.manifest.id, "../vibedesign.json"),
      (error) => error instanceof ProjectRepositoryError && error.code === "UNSAFE_PATH",
    );
    assert.throws(
      () => repository.readPreviewFile(created.manifest.id, ".vibedesign/state.json"),
      (error) => error instanceof ProjectRepositoryError && error.code === "UNSAFE_PATH",
    );

    const moved = join(workspace, "project-management-moved");
    renameSync(created.directory, moved);
    assert.equal(repository.list()[0].missing, true);

    const reopened = repository.open(moved);
    assert.equal(reopened.manifest.id, created.manifest.id);
    assert.equal(repository.list()[0].directory, reopened.directory);
    assert.equal(repository.list()[0].missing, undefined);

    repository.removeFromIndex(created.manifest.id);
    assert.deepEqual(repository.list(), []);
    assert.equal(existsSync(moved), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ProjectRepository never overwrites an existing project directory", () => {
  const root = mkdtempSync(join(tmpdir(), "vibedesign-v2-conflict-"));
  try {
    const workspace = join(root, "workspace");
    mkdirSync(join(workspace, "existing"), { recursive: true });
    const repository = new ProjectRepository(join(root, "data", "project-index.json"));

    assert.throws(
      () =>
        repository.create({
          parentDirectory: workspace,
          name: "Existing",
          folderName: "existing",
          platform: "web",
        }),
      (error) => error instanceof ProjectRepositoryError && error.code === "ALREADY_EXISTS",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ProjectRepository exports a development-ready frontend without internal history", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibedesign-v2-export-"));
  try {
    const workspace = join(root, "workspace");
    const exports = join(root, "exports");
    mkdirSync(workspace);
    mkdirSync(exports);
    const repository = new ProjectRepository(join(root, "data", "project-index.json"));
    const created = repository.create({
      parentDirectory: workspace,
      name: "Export ready",
      platform: "web",
      proposal: { brief: "A frontend-only project.", strategy: "global-draft", pageTitles: ["首页"], primaryFlowName: "浏览首页" },
    });
    writeFileSync(join(created.directory, ".vibedesign", "private-note.txt"), "not exported");

    const exported = await repository.exportProject(created.manifest.id, exports, validateExportedProject);
    assert.equal(existsSync(join(exported.directory, "pages", "index.html")), true);
    assert.equal(existsSync(join(exported.directory, "vibedesign.json")), true);
    assert.equal(existsSync(join(exported.directory, ".vibedesign")), false);
    assert.equal(exported.validation.status, "unverified");
    assert.equal(existsSync(join(exported.directory, exported.handoffDataFile)), true);
    assert.match(readFileSync(join(exported.directory, exported.handoffFile), "utf8"), /接入你自己的数据层/);
    const handoff = JSON.parse(readFileSync(join(exported.directory, exported.handoffDataFile), "utf8"));
    assert.equal(handoff.schema, "vibedesign.handoff");
    assert.match(handoff.designLanguage.tokensCss, /--color-canvas/);
    await assert.rejects(
      () => repository.exportProject(
        created.manifest.id,
        exports,
        async () => ({ status: "failed", validatedAt: Date.now(), flows: [] }),
        "failed-export",
      ),
      (error) => error instanceof ProjectRepositoryError && error.code === "INVALID_PROJECT",
    );
    assert.equal(existsSync(join(exports, "failed-export")), false);
    await assert.rejects(
      () => repository.exportProject(created.manifest.id, exports, validateExportedProject),
      (error) => error instanceof ProjectRepositoryError && error.code === "ALREADY_EXISTS",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ProjectRepository ZIP export preserves the verified tree and reruns completed flows after extraction", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibedesign-v2-zip-export-"));
  try {
    const workspace = join(root, "workspace");
    const exports = join(root, "exports");
    const unpacked = join(root, "unpacked");
    mkdirSync(workspace);
    mkdirSync(exports);
    mkdirSync(unpacked);
    const repository = new ProjectRepository(join(root, "data", "project-index.json"));
    const created = repository.create({ parentDirectory: workspace, name: "Verified delivery", platform: "web" });
    const withPage = repository.addPage(created.manifest.id, { title: "详情" });
    const withFlow = repository.addFlow(created.manifest.id, {
      name: "浏览详情",
      pageIds: withPage.manifest.pages.map((page) => page.id),
    });
    for (const page of withFlow.manifest.pages) {
      writeFileSync(
        join(created.directory, page.path),
        `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${page.title}</title><link rel="stylesheet" href="../tokens.css"></head><body><main><h1>${page.title}</h1><p>可独立运行的前端页面。</p></main></body></html>`,
        "utf8",
      );
    }
    const flowId = withFlow.manifest.flows[0].id;
    repository.validateExperienceFlow(created.manifest.id, flowId, true);
    repository.completeExperienceFlow(created.manifest.id, flowId, acceptedReview);

    const exported = await repository.exportProject(
      created.manifest.id,
      exports,
      validateExportedProject,
      "verified-delivery",
      "zip",
    );
    assert.equal(exported.format, "zip");
    assert.equal(exported.validation.status, "passed");
    assert.equal(existsSync(exported.archiveFile), true);
    await extractZip(exported.archiveFile, { dir: unpacked });
    const extractedProject = join(unpacked, "verified-delivery");
    assert.deepEqual(listFiles(extractedProject), exported.files);
    assert.equal(existsSync(join(extractedProject, ".vibedesign")), false);
    const extractedValidation = await validateExportedProject(extractedProject);
    assert.equal(extractedValidation.status, "passed");
    assert.equal(extractedValidation.flows.length, 1);

    await assert.rejects(
      () => repository.exportProject(
        created.manifest.id,
        exports,
        async () => ({ status: "failed", validatedAt: Date.now(), flows: [] }),
        "failed-zip",
        "zip",
      ),
      (error) => error instanceof ProjectRepositoryError && error.code === "INVALID_PROJECT",
    );
    assert.equal(existsSync(join(exports, "failed-zip.zip")), false);
    assert.equal(readdirSync(exports).some((name) => name.includes("failed-zip") && name.endsWith(".tmp")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ProjectRepository manages pages and experience flows through the manifest", () => {
  const root = mkdtempSync(join(tmpdir(), "vibedesign-v2-structure-"));
  try {
    const workspace = join(root, "workspace");
    mkdirSync(workspace);
    const repository = new ProjectRepository(join(root, "data", "project-index.json"));
    const created = repository.create({
      parentDirectory: workspace,
      name: "Structured project",
      platform: "web",
    });

    const withPage = repository.addPage(created.manifest.id, { title: "项目详情", fileName: "project.html" });
    const projectPage = withPage.manifest.pages[1];
    assert.equal(projectPage.path, "pages/project.html");
    assert.equal(existsSync(join(withPage.directory, projectPage.path)), true);

    const withFlow = repository.addFlow(created.manifest.id, {
      name: "查看项目",
      pageIds: [withPage.manifest.entryPageId, projectPage.id],
    });
    assert.equal(withFlow.manifest.flows[0].steps.length, 2);
    assert.throws(
      () => repository.removePage(created.manifest.id, projectPage.id),
      (error) => error instanceof ProjectRepositoryError && error.code === "INVALID_INPUT",
    );

    const renamed = repository.renamePage(created.manifest.id, projectPage.id, { title: "项目概览" });
    assert.equal(renamed.manifest.pages[1].title, "项目概览");
    const reordered = repository.reorderPages(created.manifest.id, {
      pageIds: [projectPage.id, created.manifest.entryPageId],
    });
    assert.deepEqual(
      reordered.manifest.pages.map((page) => page.id),
      [projectPage.id, created.manifest.entryPageId],
    );

    const withoutPage = repository.removePage(created.manifest.id, projectPage.id, true);
    assert.equal(withoutPage.manifest.pages.length, 1);
    assert.equal(withoutPage.manifest.flows[0].steps.length, 1);
    assert.equal(existsSync(join(withoutPage.directory, ".vibedesign", "trash")), true);
    const withoutFlow = repository.removeFlow(created.manifest.id, withoutPage.manifest.flows[0].id);
    assert.deepEqual(withoutFlow.manifest.flows, []);

    const withMissingAsset = repository.registerAsset(created.manifest.id, {
      path: "assets/hero.png",
      kind: "image",
      source: { type: "local" },
    });
    assert.equal(withMissingAsset.manifest.assets[0].status, "missing");
    writeFileSync(join(created.directory, "assets", "hero.png"), "image");
    const audited = repository.auditAssets(created.manifest.id);
    assert.equal(audited.manifest.assets[0].status, "ready");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ProjectRepository requires a current flow run and user review before completion", () => {
  const root = mkdtempSync(join(tmpdir(), "vibedesign-v2-flow-validation-"));
  try {
    const workspace = join(root, "workspace");
    mkdirSync(workspace);
    const repository = new ProjectRepository(join(root, "data", "project-index.json"));
    const created = repository.create({ parentDirectory: workspace, name: "Flow gate", platform: "web" });
    const withPage = repository.addPage(created.manifest.id, { title: "详情" });
    const withFlow = repository.addFlow(created.manifest.id, {
      name: "查看详情",
      pageIds: withPage.manifest.pages.map((page) => page.id),
    });
    const flowId = withFlow.manifest.flows[0].id;
    assert.throws(
      () => repository.completeExperienceFlow(created.manifest.id, flowId, acceptedReview),
      (error) => error instanceof ProjectRepositoryError && error.code === "INVALID_INPUT",
    );
    assert.equal(repository.validateExperienceFlow(created.manifest.id, flowId, false).validation.passed, false);
    const validated = repository.validateExperienceFlow(created.manifest.id, flowId, true);
    assert.equal(validated.validation.passed, true);
    assert.equal(validated.record.manifest.flows[0].status, "ready-for-review");
    assert.throws(
      () => repository.completeExperienceFlow(created.manifest.id, flowId, { acceptedCriteria: [] }),
      (error) => error instanceof ProjectRepositoryError && error.code === "INVALID_INPUT",
    );
    const complete = repository.completeExperienceFlow(created.manifest.id, flowId, { ...acceptedReview, note: "视觉层级与状态反馈可接受。" });
    assert.equal(complete.manifest.flows[0].status, "completed");
    const review = repository.readExperienceFlowReview(created.manifest.id, flowId);
    assert.deepEqual(review?.acceptedCriteria, acceptedReview.acceptedCriteria);
    assert.equal(review?.note, "视觉层级与状态反馈可接受。");
    writeFileSync(join(created.directory, "pages", "index.html"), "<main>changed after run</main>");
    assert.throws(
      () => repository.completeExperienceFlow(created.manifest.id, flowId, acceptedReview),
      (error) => error instanceof ProjectRepositoryError && error.code === "INVALID_INPUT",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
