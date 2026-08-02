import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { migrateLegacyProjects } from "../src/projectMigration";
import { exportPreviewFeedback, previewSafetyStatus } from "../src/previewSafety";
import { ProjectRepository, ProjectRepositoryError } from "../src/projectRepository";

test("preview safety verifies migration backup and exports redacted local feedback", () => {
  const root = mkdtempSync(join(tmpdir(), "vibedesign-preview-safety-"));
  try {
    const legacyFile = join(root, "projects.json");
    const target = join(root, "projects");
    const feedbackDirectory = join(root, "feedback");
    const stateFile = join(root, "data", "migrations", "legacy-projects-v1.json");
    const backupDirectory = join(root, "data", "backups");
    mkdirSync(target, { recursive: true });
    mkdirSync(feedbackDirectory);
    writeFileSync(legacyFile, JSON.stringify([{
      id: "secret-project-id",
      name: "SECRET_PROJECT_NAME",
      artifacts: [{ id: "artifact-1", html: "<h1>SECRET_PROJECT_SOURCE</h1>" }],
      activeVersionId: "artifact-1",
    }]), "utf8");
    const repository = new ProjectRepository(join(root, "data", "project-index.json"));
    const migration = migrateLegacyProjects({
      legacyFile,
      targetParentDirectory: target,
      stateFile,
      backupDirectory,
      repository,
      now: () => 1_700_000_000_000,
    });
    assert.equal(migration.sourceSha256, migration.backupSha256);

    const status = previewSafetyStatus(repository, stateFile, "0.5.0");
    assert.equal(status.migration?.backupVerifiedAtMigration, true);
    assert.equal(status.migration?.backupIntact, true);
    assert.equal(status.migration?.sourceChangedSinceMigration, false);
    assert.equal(status.diagnostics.projects.total, 1);
    assert.equal(status.diagnostics.migration?.counts.migrated, 1);

    writeFileSync(legacyFile, "[]", "utf8");
    assert.equal(previewSafetyStatus(repository, stateFile, "0.5.0").migration?.sourceChangedSinceMigration, true);
    writeFileSync(migration.backupFile, "corrupted backup", "utf8");
    assert.equal(previewSafetyStatus(repository, stateFile, "0.5.0").migration?.backupIntact, false);

    const exported = exportPreviewFeedback(
      repository,
      stateFile,
      "0.5.0",
      feedbackDirectory,
      { category: "migration", summary: "迁移后列表数量不符", steps: "打开首页并查看项目列表" },
      1_700_000_100_000,
    );
    const raw = readFileSync(exported.file, "utf8");
    const bundle = JSON.parse(raw);
    assert.equal(bundle.schema, "vibedesign.preview-feedback");
    assert.equal(bundle.issue.summary, "迁移后列表数量不符");
    assert.equal(bundle.diagnostics.migration.counts.migrated, 1);
    assert.doesNotMatch(raw, /SECRET_PROJECT_NAME|SECRET_PROJECT_SOURCE|secret-project-id/);
    assert.equal(raw.includes(root), false);
    assert.equal(raw.includes(migration.backupFile), false);
    assert.throws(
      () => exportPreviewFeedback(repository, stateFile, "0.5.0", feedbackDirectory, { category: "bug", summary: "" }),
      (error) => error instanceof ProjectRepositoryError && error.code === "INVALID_INPUT",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
