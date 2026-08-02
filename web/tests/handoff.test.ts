import assert from "node:assert/strict";
import test from "node:test";
import { buildDesignManifest, buildSiteManifest } from "../src/lib/handoff";

test("design handoff extracts tokens, structure, and interactions", () => {
  const html = `<!doctype html>
    <style>
      :root { --color-primary: #635bff; --space-md: 16px }
      button:hover { opacity: .9 }
      button:focus-visible { outline: 2px solid currentColor }
    </style>
    <main>
      <h1>Dashboard</h1>
      <form><button type="submit">Create</button></form>
    </main>
    <script>document.querySelector("form").addEventListener("submit", () => {})</script>`;

  const manifest = buildDesignManifest(html, "Project management");

  assert.equal(manifest.schema, "vibedesign.design-manifest/v1");
  assert.deepEqual(manifest.tokens, [
    { name: "--color-primary", value: "#635bff" },
    { name: "--space-md", value: "16px" },
  ]);
  assert.equal(manifest.structure.headings, 1);
  assert.equal(manifest.structure.forms, 1);
  assert.ok(manifest.interactions.includes("hover states"));
  assert.ok(manifest.interactions.includes("focus states"));
  assert.ok(manifest.interactions.includes("scripted interactivity"));
});

test("site handoff preserves declared pages and shared CSS tokens", () => {
  const files = {
    "index.html": '<main><h1>Dashboard</h1><a href="project.html">Open</a></main>',
    "project.html": "<main><h1>Project</h1><button>Create task</button></main>",
    "styles.css": ":root { --color-primary: #635bff; }",
  };
  const manifest = buildSiteManifest("Project management", "index.html", files, {
    pages: [
      { path: "index.html", title: "Dashboard" },
      { path: "project.html", title: "Project" },
    ],
    flows: [{ name: "Open project", steps: ["index.html", "project.html"] }],
  });

  assert.equal(manifest.pages.length, 2);
  assert.deepEqual(manifest.flows[0].steps, ["index.html", "project.html"]);
  assert.deepEqual(manifest.tokens, [{ name: "--color-primary", value: "#635bff" }]);
  assert.equal(manifest.structure.headings, 2);
});
