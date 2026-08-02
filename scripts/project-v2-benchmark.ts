import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commitProjectChange, planProjectChange } from "../server/src/projectChanges.js";
import { ProjectRepository } from "../server/src/projectRepository.js";
import { validateProjectFlowRuntime } from "../server/src/projectFlowRuntime.js";
import { completedFlowsAffectedByFiles, rerunCompletedFlows } from "../server/src/projectRegression.js";
import { validateExportedProject } from "../server/src/projectExportValidation.js";
import { PROJECT_FLOW_REVIEW_CRITERIA, type ProjectFlowAutomationUpdate } from "../shared/project.js";

const acceptedReview = { acceptedCriteria: PROJECT_FLOW_REVIEW_CRITERIA.map((criterion) => criterion.id) };

async function main(): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "vibedesign-project-benchmark-"));
  try {
  const workspace = join(root, "workspace");
  const exports = join(root, "exports");
  mkdirSync(workspace);
  mkdirSync(exports);
  const repository = new ProjectRepository(join(root, "data", "project-index.json"));
  const created = repository.create({
    parentDirectory: workspace,
    name: "轻量项目管理",
    platform: "web",
    proposal: {
      brief: "小型创意团队创建项目并添加首个任务的前端体验。",
      strategy: "flow-deepening",
      pageTitles: ["仪表盘", "新建项目", "项目详情"],
      primaryFlowName: "创建并查看第一个项目",
    },
  });
  const [dashboard, createPage, detailPage] = created.manifest.pages;
  const dashboardBefore = readFileSync(join(created.directory, dashboard.path), "utf8");

  const tokenChange = ":root { --color-canvas: #f7f5ef; --color-text: #20201d; }";
  const tokenPlan = planProjectChange(repository, created.manifest.id, [{ path: "tokens.css", content: tokenChange }]);
  assert.equal(tokenPlan.level, "shared");
  commitProjectChange(repository, created.manifest.id, [{ path: "tokens.css", content: tokenChange }], tokenPlan.impactHash);

  const detailChange = "<!doctype html><html><body><main><h1>网站改版</h1><p>任务 1</p></main></body></html>";
  const detailPlan = planProjectChange(repository, created.manifest.id, [{ path: detailPage.path, content: detailChange }]);
  assert.equal(detailPlan.level, "local");
  commitProjectChange(repository, created.manifest.id, [{ path: detailPage.path, content: detailChange }], detailPlan.impactHash);
  assert.equal(readFileSync(join(created.directory, dashboard.path), "utf8"), dashboardBefore);
  assert.equal(readFileSync(join(created.directory, detailPage.path), "utf8"), detailChange);
  assert.ok(createPage.path);

  const flow = repository.get(created.manifest.id).manifest.flows[0]!;
  const interactiveFiles = [
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
  const flowSteps: ProjectFlowAutomationUpdate[] = [
    {
      stepId: flow.steps[0]!.id,
      commands: [
        { type: "open" },
        { type: "expect-visible", target: { by: "text", value: "尚无项目" } },
        { type: "click", target: { by: "role", value: "link", name: "新建项目" } },
        { type: "expect-url", value: createPage.path },
      ],
    },
    {
      stepId: flow.steps[1]!.id,
      commands: [
        { type: "click", target: { by: "role", value: "button", name: "创建项目" } },
        { type: "expect-field-error", target: { by: "label", value: "项目名称" }, value: "请输入项目名称" },
        { type: "fill", target: { by: "label", value: "项目名称" }, value: "网站改版" },
        { type: "click", target: { by: "role", value: "button", name: "创建项目" } },
        { type: "expect-status", value: "正在创建" },
        { type: "expect-url", value: detailPage.path },
      ],
    },
    {
      stepId: flow.steps[2]!.id,
      commands: [
        { type: "expect-visible", target: { by: "role", value: "heading", name: "网站改版" } },
        { type: "fill", target: { by: "label", value: "任务名称" }, value: "梳理首页信息架构" },
        { type: "click", target: { by: "role", value: "button", name: "新建任务" } },
        { type: "expect-visible", target: { by: "text", value: "梳理首页信息架构" } },
        { type: "expect-text", target: { by: "vd-id", value: "task-count" }, value: "1" },
        { type: "expect-status", value: "任务已创建" },
      ],
    },
  ];
  const deepeningPlan = planProjectChange(repository, created.manifest.id, interactiveFiles);
  commitProjectChange(repository, created.manifest.id, interactiveFiles, deepeningPlan.impactHash, {
    deepenedFlowId: flow.id,
    flowSteps,
  });

  const flowId = flow.id;
  const runtime = await validateProjectFlowRuntime(repository, created.manifest.id, flowId);
  assert.deepEqual(runtime.stepFailures, []);
  const validation = repository.validateExperienceFlow(created.manifest.id, flowId, true, runtime);
  assert.equal(validation.validation.passed, true);
  assert.equal(repository.completeExperienceFlow(created.manifest.id, flowId, acceptedReview).manifest.flows[0]!.status, "completed");
  assert.equal(repository.readExperienceFlowReview(created.manifest.id, flowId)?.acceptedCriteria.length, PROJECT_FLOW_REVIEW_CRITERIA.length);

  const regressionTokenChange = ":root { --color-canvas: #f1efe8; --color-text: #20201d; }";
  const completedManifest = repository.get(created.manifest.id).manifest;
  const affectedCompletedFlows = completedFlowsAffectedByFiles(completedManifest, [completedManifest.designLanguage.tokens]);
  assert.deepEqual(affectedCompletedFlows, [flowId]);
  const regressionPlan = planProjectChange(repository, created.manifest.id, [{ path: "tokens.css", content: regressionTokenChange }]);
  commitProjectChange(
    repository,
    created.manifest.id,
    [{ path: "tokens.css", content: regressionTokenChange }],
    regressionPlan.impactHash,
  );
  const regression = await rerunCompletedFlows(repository, created.manifest.id, affectedCompletedFlows);
  assert.equal(regression.regression[0]!.passed, true);
  assert.equal(regression.record.manifest.flows[0]!.status, "ready-for-review");
  assert.equal(repository.completeExperienceFlow(created.manifest.id, flowId, acceptedReview).manifest.flows[0]!.status, "completed");

  const exported = await repository.exportProject(created.manifest.id, exports, validateExportedProject);
  assert.ok(exported.files.includes("VIBEDESIGN_HANDOFF.md"));
  assert.ok(exported.files.includes("VIBEDESIGN_HANDOFF.json"));
  assert.equal(exported.validation.status, "passed");
  const handoff = JSON.parse(readFileSync(join(exported.directory, exported.handoffDataFile), "utf8"));
  assert.equal(handoff.flows[0].review.acceptedCriteria.length, PROJECT_FLOW_REVIEW_CRITERIA.length);
  assert.equal(handoff.flows[0].validation.passed, true);
  assert.equal(handoff.exportValidation.status, "passed");
  assert.equal(readFileSync(join(exported.directory, detailPage.path), "utf8"), interactiveFiles[2]!.content);
  console.log("Project V2 benchmark passed: 多页面流程、共享令牌、局部修改、真实交互、基础可访问性、自动回归、结构化设计评审和独立前端导出均已验证。");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
