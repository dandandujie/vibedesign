import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PROJECT_FLOW_REVIEW_CRITERIA } from "../../shared/project";
import { completedFlowsAffectedByFiles, rerunCompletedFlows } from "../src/projectRegression";
import { ProjectRepository } from "../src/projectRepository";

const acceptedReview = { acceptedCriteria: PROJECT_FLOW_REVIEW_CRITERIA.map((criterion) => criterion.id) };

test("completed flow regression is scoped to changed pages and keeps independent validations current", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibedesign-flow-regression-"));
  try {
    const workspace = join(root, "workspace");
    mkdirSync(workspace);
    const repository = new ProjectRepository(join(root, "data", "project-index.json"));
    const created = repository.create({ parentDirectory: workspace, name: "Regression", platform: "web" });
    const withPage = repository.addPage(created.manifest.id, { title: "详情" });
    const home = withPage.manifest.pages[0];
    const detail = withPage.manifest.pages[1];
    repository.addFlow(created.manifest.id, { name: "查看首页", pageIds: [home.id] });
    const bothFlows = repository.addFlow(created.manifest.id, { name: "查看详情", pageIds: [detail.id] });
    const [homeFlow, detailFlow] = bothFlows.manifest.flows;

    repository.validateExperienceFlow(created.manifest.id, homeFlow.id, true);
    repository.validateExperienceFlow(created.manifest.id, detailFlow.id, true);
    repository.completeExperienceFlow(created.manifest.id, homeFlow.id, acceptedReview);
    const completed = repository.completeExperienceFlow(created.manifest.id, detailFlow.id, acceptedReview);
    assert.deepEqual(completed.manifest.flows.map((flow) => flow.status), ["completed", "completed"]);
    const affected = completedFlowsAffectedByFiles(completed.manifest, [home.path]);
    assert.deepEqual(affected, [homeFlow.id]);
    assert.deepEqual(
      completedFlowsAffectedByFiles(completed.manifest, [completed.manifest.designLanguage.tokens]),
      [homeFlow.id, detailFlow.id],
    );

    writeFileSync(join(created.directory, ...home.path.split("/")), "<!doctype html><html><body><h1>首页</h1></body></html>");
    const rerun = await rerunCompletedFlows(repository, created.manifest.id, affected);
    assert.equal(rerun.regression.length, 1);
    assert.equal(rerun.regression[0].passed, true);
    assert.deepEqual(rerun.record.manifest.flows.map((flow) => flow.status), ["ready-for-review", "completed"]);

    repository.completeExperienceFlow(created.manifest.id, homeFlow.id, acceptedReview);
    writeFileSync(
      join(created.directory, ...home.path.split("/")),
      "<!doctype html><html><body><h1>首页</h1><script>console.error('regression')</script></body></html>",
    );
    const failed = await rerunCompletedFlows(
      repository,
      created.manifest.id,
      completedFlowsAffectedByFiles(repository.get(created.manifest.id).manifest, [home.path]),
    );
    assert.equal(failed.regression[0].passed, false);
    assert.deepEqual(failed.record.manifest.flows.map((flow) => flow.status), ["draft", "completed"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
