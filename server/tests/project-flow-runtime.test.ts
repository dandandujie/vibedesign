import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { validateProjectFlowRuntime } from "../src/projectFlowRuntime";
import { ProjectRepository } from "../src/projectRepository";

const projectRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const electronPackage = join(projectRoot, "node_modules", "electron");

test("flow runtime validation reports browser errors, broken links, remote dependencies, and overflow", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibedesign-flow-runtime-"));
  try {
    const workspace = join(root, "workspace");
    mkdirSync(workspace);
    const repository = new ProjectRepository(join(root, "data", "project-index.json"));
    const created = repository.create({
      parentDirectory: workspace,
      name: "Runtime validation",
      platform: "web",
      proposal: {
        brief: "Expose browser validation failures.",
        strategy: "flow-deepening",
        pageTitles: ["首页"],
        primaryFlowName: "打开首页",
      },
    });
    writeFileSync(
      join(created.directory, "pages", "index.html"),
      `<!doctype html><html><head><link rel="stylesheet" href="../tokens.css"></head><body style="width:2000px"><h1>首页</h1><a href="missing.html">失效链接</a><img src="https://example.com/remote.png"><button aria-label="被遮挡操作">操作</button><div style="position:fixed;inset:0;z-index:10;background:#fff"></div><script>console.error("runtime boom")</script></body></html>`,
    );

    const report = await validateProjectFlowRuntime(repository, created.manifest.id, created.manifest.flows[0].id);
    assert.ok(report.runtimeErrors.some((item) => item.includes("runtime boom")));
    assert.ok(report.brokenLinks.some((item) => item.includes("missing.html")));
    assert.ok(report.externalRequests.some((item) => item.includes("example.com")));
    assert.ok(report.horizontalOverflow.length > 0);
    assert.ok(report.accessibilityIssues.some((item) => item.includes("图片缺少 alt")));
    assert.ok(report.inoperableControls.some((item) => item.includes("被其他元素遮挡")));
    assert.equal(repository.validateExperienceFlow(created.manifest.id, created.manifest.flows[0].id, true, report).validation.passed, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("flow runtime validation executes observable UI actions across pages and viewports", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibedesign-flow-actions-"));
  try {
    const workspace = join(root, "workspace");
    mkdirSync(workspace);
    const repository = new ProjectRepository(join(root, "data", "project-index.json"));
    const created = repository.create({
      parentDirectory: workspace,
      name: "Interactive validation",
      platform: "web",
      proposal: {
        brief: "Create a project and its first task.",
        strategy: "flow-deepening",
        pageTitles: ["仪表盘", "新建项目", "项目详情"],
        primaryFlowName: "创建首个项目和任务",
      },
    });
    const [dashboard, createPage, detailPage] = created.manifest.pages;
    const flow = created.manifest.flows[0];
    const files = [
      {
        path: dashboard.path,
        content: `<!doctype html><html><head><link rel="stylesheet" href="../tokens.css"></head><body><main><h1>仪表盘</h1><p>尚无项目</p><a href="page-2.html">新建项目</a></main></body></html>`,
      },
      {
        path: createPage.path,
        content: `<!doctype html><html><head><link rel="stylesheet" href="../tokens.css"></head><body><main><h1>新建项目</h1><form><label for="project-name">项目名称</label><input id="project-name" name="name" aria-describedby="name-error"><button>创建项目</button><p id="name-error" role="alert" hidden></p><p role="status" hidden></p></form></main><script>const form=document.querySelector('form'),input=form.elements.name,alert=document.querySelector('[role=alert]'),status=document.querySelector('[role=status]');form.addEventListener('submit',event=>{event.preventDefault();if(!input.value.trim()){input.setAttribute('aria-invalid','true');alert.hidden=false;alert.textContent='请输入项目名称';return}input.removeAttribute('aria-invalid');alert.hidden=true;status.hidden=false;status.textContent='正在创建';localStorage.setItem('projectName',input.value);setTimeout(()=>location.href='page-3.html',50)})</script></body></html>`,
      },
      {
        path: detailPage.path,
        content: `<!doctype html><html><head><link rel="stylesheet" href="../tokens.css"></head><body><main><h1></h1><p>任务 <span data-vd-id="task-count">0</span></p><label>任务名称<input name="task"></label><button>新建任务</button><ul></ul><p role="status" hidden></p></main><script>document.querySelector('h1').textContent=localStorage.getItem('projectName')||'项目详情';document.querySelector('button').addEventListener('click',()=>{const input=document.querySelector('[name=task]');if(!input.value)return;const item=document.createElement('li');item.textContent=input.value;document.querySelector('ul').append(item);document.querySelector('[data-vd-id=task-count]').textContent='1';const status=document.querySelector('[role=status]');status.hidden=false;status.textContent='任务已创建'})</script></body></html>`,
      },
    ];
    const flowSteps = [
      {
        stepId: flow.steps[0].id,
        commands: [
          { type: "open" as const },
          { type: "expect-visible" as const, target: { by: "text" as const, value: "尚无项目" } },
          { type: "click" as const, target: { by: "role" as const, value: "link" as const, name: "新建项目" } },
          { type: "expect-url" as const, value: createPage.path },
        ],
      },
      {
        stepId: flow.steps[1].id,
        commands: [
          { type: "click" as const, target: { by: "role" as const, value: "button" as const, name: "创建项目" } },
          { type: "expect-field-error" as const, target: { by: "label" as const, value: "项目名称" }, value: "请输入项目名称" },
          { type: "fill" as const, target: { by: "label" as const, value: "项目名称" }, value: "网站改版" },
          { type: "click" as const, target: { by: "role" as const, value: "button" as const, name: "创建项目" } },
          { type: "expect-status" as const, value: "正在创建" },
          { type: "expect-url" as const, value: detailPage.path },
        ],
      },
      {
        stepId: flow.steps[2].id,
        commands: [
          { type: "expect-visible" as const, target: { by: "role" as const, value: "heading" as const, name: "网站改版" } },
          { type: "fill" as const, target: { by: "label" as const, value: "任务名称" }, value: "梳理首页信息架构" },
          { type: "click" as const, target: { by: "role" as const, value: "button" as const, name: "新建任务" } },
          { type: "expect-visible" as const, target: { by: "text" as const, value: "梳理首页信息架构" } },
          { type: "expect-text" as const, target: { by: "vd-id" as const, value: "task-count" }, value: "1" },
          { type: "expect-status" as const, value: "任务已创建" },
        ],
      },
    ];
    repository.replaceProjectFiles(created.manifest.id, files, created.manifest.pages.map((page) => page.id), {
      deepenedFlowId: flow.id,
      flowSteps,
    });

    const report = await validateProjectFlowRuntime(repository, created.manifest.id, flow.id);
    assert.deepEqual(report, {
      runtimeErrors: [],
      brokenLinks: [],
      externalRequests: [],
      horizontalOverflow: [],
      stepFailures: [],
      accessibilityIssues: [],
      inoperableControls: [],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("flow runtime validation reuses packaged Electron Chromium without a Playwright browser download", {
  skip: !existsSync(electronPackage) && "root Electron dependency is not installed",
}, async () => {
  const root = mkdtempSync(join(tmpdir(), "vibedesign-electron-runtime-"));
  try {
    const workspace = join(root, "workspace");
    mkdirSync(workspace);
    const repository = new ProjectRepository(join(root, "data", "project-index.json"));
    const created = repository.create({
      parentDirectory: workspace,
      name: "Packaged runtime",
      platform: "web",
      proposal: {
        brief: "Validate a packaged frontend flow.",
        strategy: "flow-deepening",
        pageTitles: ["首页"],
        primaryFlowName: "打开首页",
      },
    });
    writeFileSync(
      join(created.directory, "pages", "index.html"),
      `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>首页</title><link rel="stylesheet" href="../tokens.css"></head><body><main><h1>首页</h1><p>安装版复用 Electron Chromium。</p></main></body></html>`,
      "utf8",
    );
    const require = createRequire(import.meta.url);
    const electronExecutable = require(electronPackage) as string;
    const report = await validateProjectFlowRuntime(
      repository,
      created.manifest.id,
      created.manifest.flows[0].id,
      { electronExecutable, electronArguments: [projectRoot] },
    );
    assert.deepEqual(report, {
      runtimeErrors: [],
      brokenLinks: [],
      externalRequests: [],
      horizontalOverflow: [],
      stepFailures: [],
      accessibilityIssues: [],
      inoperableControls: [],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
