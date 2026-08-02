import assert from "node:assert/strict";
import test from "node:test";
import { extractArtifact, extractFiles, extractSite } from "../../shared/extract";

test("extractArtifact returns the last HTML artifact", () => {
  const message = [
    "```html",
    "<main>first</main>",
    "```",
    "some explanation",
    "```html",
    "<main>latest</main>",
    "```",
  ].join("\n");

  assert.equal(extractArtifact(message), "<main>latest</main>");
});

test("extractFiles parses an entry and sibling files", () => {
  const message = [
    "```vdfiles",
    "entry: pages/index.html",
    "=== pages/index.html ===",
    '<link rel="stylesheet" href="../styles.css">',
    "=== styles.css ===",
    ":root { --accent: #635bff; }",
    "```",
  ].join("\n");

  const artifact = extractFiles(message);
  assert.ok(artifact);
  assert.equal(artifact.entry, "pages/index.html");
  assert.deepEqual(Object.keys(artifact.files), ["pages/index.html", "styles.css"]);
  assert.match(artifact.files["styles.css"], /--accent/);
});

test("extractSite reads pages and flows from site.json", () => {
  const message = [
    "```vdsite",
    "entry: index.html",
    "=== site.json ===",
    JSON.stringify({
      pages: [
        { path: "index.html", title: "仪表盘" },
        { path: "project.html", title: "项目详情" },
      ],
      flows: [{ name: "创建项目", steps: ["index.html", "project.html"] }],
    }),
    "=== index.html ===",
    "<main>dashboard</main>",
    "=== project.html ===",
    "<main>project</main>",
    "```",
  ].join("\n");

  const artifact = extractSite(message);
  assert.ok(artifact?.site);
  assert.equal(artifact.entry, "index.html");
  assert.equal(artifact.site.pages.length, 2);
  assert.deepEqual(artifact.site.flows?.[0].steps, ["index.html", "project.html"]);
});

test("extractSite keeps files usable when site.json is invalid", () => {
  const message = [
    "```vdsite",
    "entry: index.html",
    "=== site.json ===",
    "{not-json}",
    "=== index.html ===",
    "<main>fallback</main>",
    "```",
  ].join("\n");

  const artifact = extractSite(message);
  assert.ok(artifact);
  assert.equal(artifact.site, undefined);
  assert.equal(artifact.files["index.html"], "<main>fallback</main>\n");
});
