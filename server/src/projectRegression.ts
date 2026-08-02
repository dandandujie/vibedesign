import type {
  ProjectFlowRegressionResult,
  ProjectManifest,
  ProjectRecord,
} from "../../shared/project.js";
import { validateProjectFlowRuntime } from "./projectFlowRuntime.js";
import { ProjectRepository } from "./projectRepository.js";

export function completedFlowsAffectedByFiles(manifest: ProjectManifest, changedFiles: string[]): string[] {
  const paths = new Set(changedFiles.map((path) => path.replace(/\\/g, "/")));
  const pageByPath = new Map(manifest.pages.map((page) => [page.path, page.id]));
  const changedPageIds = new Set(
    [...paths].map((path) => pageByPath.get(path)).filter((pageId): pageId is string => Boolean(pageId)),
  );
  const affectsAll = [...paths].some((path) =>
    path === "vibedesign.json" ||
    path === manifest.designLanguage.tokens ||
    path === manifest.designLanguage.componentsDir ||
    path.startsWith(`${manifest.designLanguage.componentsDir}/`) ||
    path === "assets" ||
    path.startsWith("assets/") ||
    (path.startsWith("pages/") && !pageByPath.has(path)),
  );
  return manifest.flows
    .filter((flow) =>
      flow.status === "completed" &&
      (affectsAll || flow.steps.some((step) => changedPageIds.has(step.pageId))),
    )
    .map((flow) => flow.id);
}

export async function rerunCompletedFlows(
  repository: ProjectRepository,
  projectId: string,
  flowIds: string[],
): Promise<{ record: ProjectRecord; regression: ProjectFlowRegressionResult[] }> {
  const regression: ProjectFlowRegressionResult[] = [];
  for (const flowId of flowIds) {
    const flow = repository.get(projectId).manifest.flows.find((item) => item.id === flowId);
    if (!flow) continue;
    try {
      const runtime = await validateProjectFlowRuntime(repository, projectId, flowId);
      const result = repository.validateExperienceFlow(projectId, flowId, true, runtime);
      regression.push({ flowId, flowName: flow.name, passed: result.validation.passed, validation: result.validation });
    } catch (error) {
      regression.push({
        flowId,
        flowName: flow.name,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { record: repository.get(projectId), regression };
}
