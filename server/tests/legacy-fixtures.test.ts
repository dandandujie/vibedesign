import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { readJsonFile } from "../src/jsonFile";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

test("legacy fixtures cover single-page and vdsite project shapes", () => {
  const single = JSON.parse(readFileSync(join(fixtureDir, "legacy-single-page.json"), "utf8"));
  const site = JSON.parse(readFileSync(join(fixtureDir, "legacy-vdsite.json"), "utf8"));

  assert.equal(single.artifacts[0].kind, "html");
  assert.equal(single.artifacts[0].id, single.activeVersionId);
  assert.equal(site.artifacts[0].kind, "multifile");
  assert.equal(site.artifacts[0].site.pages.length, 2);
  assert.equal(site.artifacts[0].site.flows.length, 1);
});

test("corrupt legacy fixture is quarantined by the current JSON reader", () => {
  const dir = mkdtempSync(join(tmpdir(), "vibedesign-legacy-"));
  try {
    const target = join(dir, "projects.json");
    copyFileSync(join(fixtureDir, "corrupt-projects.json"), target);

    assert.throws(() => readJsonFile(target, []), /invalid JSON moved/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
