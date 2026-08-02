import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProjectExportValidation } from "../../shared/project.js";
import { validateProjectFlowRuntime } from "./projectFlowRuntime.js";
import { ProjectRepository } from "./projectRepository.js";

export async function validateExportedProject(directory: string): Promise<ProjectExportValidation> {
  const dataDirectory = mkdtempSync(join(tmpdir(), "vibedesign-export-validation-"));
  try {
    const repository = new ProjectRepository(join(dataDirectory, "project-index.json"));
    const record = repository.open(directory);
    const completedFlows = record.manifest.flows.filter((flow) => flow.status === "completed");
    const flows = [];
    for (const flow of completedFlows) {
      const runtime = await validateProjectFlowRuntime(repository, record.manifest.id, flow.id);
      flows.push({
        flowId: flow.id,
        flowName: flow.name,
        passed:
          runtime.runtimeErrors.length === 0 &&
          runtime.brokenLinks.length === 0 &&
          runtime.externalRequests.length === 0 &&
          runtime.horizontalOverflow.length === 0 &&
          runtime.stepFailures.length === 0 &&
          runtime.accessibilityIssues.length === 0 &&
          runtime.inoperableControls.length === 0,
        runtime,
      });
    }
    return {
      status: !flows.length ? "unverified" : flows.every((flow) => flow.passed) ? "passed" : "failed",
      validatedAt: Date.now(),
      flows,
    };
  } finally {
    rmSync(dataDirectory, { recursive: true, force: true });
  }
}
