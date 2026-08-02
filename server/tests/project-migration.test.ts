import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  migrateLegacyProjects,
  ProjectMigrationError,
  readLegacyMigrationReport,
} from "../src/projectMigration";
import { ProjectRepository } from "../src/projectRepository";

const fixtures = join(import.meta.dirname, "fixtures");

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtures, name), "utf8"));
}

test("legacy migration copies single-page and vdsite projects without changing the source", () => {
  const root = mkdtempSync(join(tmpdir(), "vibedesign-migration-"));
  try {
    const legacyFile = join(root, "projects.json");
    const workspace = join(root, "workspace");
    const stateFile = join(root, "data", "migrations", "legacy-projects-v1.json");
    const backupDirectory = join(root, "data", "backups");
    mkdirSync(workspace);
    const source = JSON.stringify(
      [
        fixture("legacy-single-page.json"),
        fixture("legacy-vdsite.json"),
        {
          id: "legacy-extension",
          name: "Legacy extension",
          artifacts: [{ id: "v1", kind: "markdown", html: "# Report" }],
          updatedAt: 1700000000000,
        },
      ],
      null,
      2,
    );
    writeFileSync(legacyFile, source);
    const repository = new ProjectRepository(join(root, "data", "project-index.json"));

    const report = migrateLegacyProjects({
      legacyFile,
      targetParentDirectory: workspace,
      stateFile,
      backupDirectory,
      repository,
      now: () => 1800000000000,
    });

    assert.deepEqual(report.counts, { migrated: 2, skipped: 0, readonly: 1, failed: 0 });
    assert.equal(readFileSync(legacyFile, "utf8"), source);
    assert.equal(readFileSync(report.backupFile, "utf8"), source);
    assert.equal(repository.list().length, 2);

    const single = report.results.find((result) => result.legacyProjectId === "legacy-single");
    assert.equal(single?.status, "migrated");
    assert.ok(single?.directory);
    assert.match(readFileSync(join(single.directory, "pages", "index.html"), "utf8"), /Legacy page/);
    assert.equal(existsSync(join(single.directory, ".vibedesign", "versions", "legacy", "project.json")), true);

    const site = report.results.find((result) => result.legacyProjectId === "legacy-site");
    assert.equal(site?.status, "migrated");
    assert.ok(site?.directory);
    assert.match(readFileSync(join(site.directory, "pages", "project.html"), "utf8"), /Project/);
    assert.match(readFileSync(join(site.directory, "pages", "styles.css"), "utf8"), /--color-primary/);
    const siteManifest = JSON.parse(readFileSync(join(site.directory, "vibedesign.json"), "utf8")) as {
      pages: { path: string }[];
      flows: { name: string; steps: { pageId: string }[] }[];
    };
    assert.deepEqual(
      siteManifest.pages.map((page) => page.path),
      ["pages/index.html", "pages/project.html"],
    );
    assert.equal(siteManifest.flows[0].name, "Open project");
    assert.equal(siteManifest.flows[0].steps.length, 2);

    const second = migrateLegacyProjects({
      legacyFile,
      targetParentDirectory: workspace,
      stateFile,
      backupDirectory,
      repository,
      now: () => 1800000001000,
    });
    assert.deepEqual(second.counts, { migrated: 0, skipped: 2, readonly: 1, failed: 0 });
    assert.equal(repository.list().length, 2);
    assert.equal(readdirSync(workspace).length, 2);
    assert.deepEqual(readLegacyMigrationReport(stateFile), second);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("corrupt legacy data is backed up and reported without modifying the source", () => {
  const root = mkdtempSync(join(tmpdir(), "vibedesign-migration-corrupt-"));
  try {
    const legacyFile = join(root, "projects.json");
    const workspace = join(root, "workspace");
    const stateFile = join(root, "data", "migrations", "legacy-projects-v1.json");
    const backupDirectory = join(root, "data", "backups");
    mkdirSync(workspace);
    const source = readFileSync(join(fixtures, "corrupt-projects.json"));
    writeFileSync(legacyFile, source);
    const repository = new ProjectRepository(join(root, "data", "project-index.json"));

    assert.throws(
      () =>
        migrateLegacyProjects({
          legacyFile,
          targetParentDirectory: workspace,
          stateFile,
          backupDirectory,
          repository,
          now: () => 1800000000000,
        }),
      (error) => {
        assert.ok(error instanceof ProjectMigrationError);
        assert.equal(error.code, "INVALID_SOURCE");
        assert.equal(error.report?.counts.failed, 1);
        assert.ok(error.report?.backupFile);
        assert.deepEqual(readFileSync(error.report.backupFile), source);
        return true;
      },
    );
    assert.deepEqual(readFileSync(legacyFile), source);
    assert.deepEqual(repository.list(), []);
    assert.equal(readdirSync(workspace).length, 0);
    assert.equal(readLegacyMigrationReport(stateFile)?.counts.failed, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
