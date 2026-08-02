import assert from "node:assert/strict";
import test from "node:test";
import { createProjectManifest, parseProjectManifest } from "../src/projectManifest";

test("Project V2 manifest starts with one draft page and platform viewports", () => {
  const manifest = createProjectManifest(
    {
      parentDirectory: "C:\\unused-by-manifest",
      name: "项目管理",
      platform: "web",
      settings: { designSystemId: "builtin:linear", defaultModel: "design-model" },
    },
    "project-1",
    123,
  );

  assert.equal(manifest.schema, "vibedesign.project");
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.entryPageId, "home");
  assert.equal(manifest.pages[0].path, "pages/index.html");
  assert.equal(manifest.pages[0].status, "draft");
  assert.deepEqual(manifest.viewports.map((viewport) => viewport.id), ["desktop", "mobile"]);
  assert.deepEqual(manifest.designLanguage.source, { type: "design-system", id: "builtin:linear" });
});

test("Project V2 manifest rejects unsafe paths and broken flow references", () => {
  const manifest = createProjectManifest(
    { parentDirectory: "C:\\unused-by-manifest", name: "Test", platform: "desktop" },
    "project-1",
    123,
  );

  assert.throws(
    () => parseProjectManifest({ ...manifest, pages: [{ ...manifest.pages[0], path: "../outside.html" }] }),
    /safe relative project path/,
  );
  assert.throws(
    () =>
      parseProjectManifest({
        ...manifest,
        flows: [
          {
            id: "onboarding",
            name: "Onboarding",
            status: "draft",
            steps: [{ id: "step-1", pageId: "missing-page", action: "Open", expected: "Visible" }],
          },
        ],
      }),
    /unknown page/,
  );
});

test("Project V2 manifest materializes a confirmed project proposal", () => {
  const manifest = createProjectManifest(
    {
      parentDirectory: "C:\\Designs",
      name: "Project manager",
      platform: "web",
      proposal: {
        brief: "帮助小型产品团队创建项目并查看进度。",
        pageTitles: ["工作台", "项目详情", "设置"],
        primaryFlowName: "查看项目",
        strategy: "global-draft",
      },
    },
    "proposal-project",
    1700000000000,
  );

  assert.deepEqual(
    manifest.pages.map((page) => page.title),
    ["工作台", "项目详情", "设置"],
  );
  assert.equal(manifest.flows[0].name, "查看项目");
  assert.equal(manifest.flows[0].steps.length, 3);
  assert.equal(manifest.proposal?.primaryFlowId, manifest.flows[0].id);
});
