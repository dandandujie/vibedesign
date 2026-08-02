import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  acceptProjectVariant,
  createProjectVariant,
  detectExternalProjectChanges,
  listProjectVersions,
  restoreProjectVersion,
  snapshotProject,
} from "../src/projectVersions";
import { ProjectRepository } from "../src/projectRepository";

test("project versions restore a stable file tree and variants do not change it", () => {
  const root = mkdtempSync(join(tmpdir(), "vibedesign-versions-"));
  try {
    const workspace = join(root, "workspace");
    mkdirSync(workspace);
    const repository = new ProjectRepository(join(root, "data", "project-index.json"));
    const created = repository.create({ parentDirectory: workspace, name: "Versioned", platform: "web" });
    const page = join(created.directory, "pages", "index.html");
    const stable = readFileSync(page, "utf8");
    const version = snapshotProject(repository, created.manifest.id, { label: "初始状态", source: "manual" });
    writeFileSync(page, "<main>changed outside</main>");
    const variant = createProjectVariant(repository, created.manifest.id, "实验方向");
    assert.ok(variant.id);
    assert.equal(readFileSync(page, "utf8"), "<main>changed outside</main>");
    restoreProjectVersion(repository, created.manifest.id, version.id);
    assert.equal(readFileSync(page, "utf8"), stable);
    assert.ok(listProjectVersions(repository, created.manifest.id).some((item) => item.source === "restore"));
    acceptProjectVariant(repository, created.manifest.id, variant.id);
    assert.equal(readFileSync(page, "utf8"), "<main>changed outside</main>");
    assert.ok(listProjectVersions(repository, created.manifest.id).some((item) => item.label === "接受变体：实验方向"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("external project changes become an external version without overwriting files", () => {
  const root = mkdtempSync(join(tmpdir(), "vibedesign-external-"));
  try {
    const workspace = join(root, "workspace");
    mkdirSync(workspace);
    const repository = new ProjectRepository(join(root, "data", "project-index.json"));
    const created = repository.create({ parentDirectory: workspace, name: "External", platform: "web" });
    snapshotProject(repository, created.manifest.id, { label: "基线", source: "manual" });
    const page = join(created.directory, "pages", "index.html");
    writeFileSync(page, "<main>edited by IDE</main>");
    const detected = detectExternalProjectChanges(repository, created.manifest.id);
    assert.deepEqual(detected.changedFiles, ["pages/index.html"]);
    assert.equal(detected.version?.source, "external");
    assert.equal(readFileSync(page, "utf8"), "<main>edited by IDE</main>");
    assert.deepEqual(detectExternalProjectChanges(repository, created.manifest.id).changedFiles, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
