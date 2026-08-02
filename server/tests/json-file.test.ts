import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readJsonFile, writeJsonAtomic } from "../src/jsonFile";

test("JSON storage reads fallbacks and atomically written values", () => {
  const dir = mkdtempSync(join(tmpdir(), "vibedesign-json-"));
  try {
    const file = join(dir, "value.json");
    assert.deepEqual(readJsonFile(file, { ready: false }), { ready: false });

    writeJsonAtomic(file, { ready: true, count: 2 });

    assert.deepEqual(readJsonFile(file, null), { ready: true, count: 2 });
    assert.equal(JSON.parse(readFileSync(file, "utf8")).count, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("invalid JSON is moved aside instead of silently overwritten", () => {
  const dir = mkdtempSync(join(tmpdir(), "vibedesign-corrupt-"));
  try {
    const file = join(dir, "projects.json");
    writeFileSync(file, "{ invalid json");

    assert.throws(() => readJsonFile(file, []), /invalid JSON moved/);
    assert.equal(existsSync(file), false);
    assert.equal(existsSync(`${file}.corrupt`), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
