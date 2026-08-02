import type {
  CompleteExperienceFlowInput,
  CreateExperienceFlowInput,
  CreateProjectPageInput,
  CreateProjectInput,
  ProjectExport,
  ProjectIndexEntry,
  ProjectRecord,
  PreviewFeedbackExport,
  PreviewFeedbackInput,
  PreviewSafetyStatus,
  RenameExperienceFlowInput,
  RenameProjectPageInput,
} from "../../../shared/project";
import type { ProjectFlowAutomationUpdate, ProjectFlowRegressionResult, ProjectFlowReview, ProjectFlowValidation, ProjectVariant, ProjectVersion } from "../../../shared/project";

export interface ProjectFileConflict {
  path: string;
  currentContent: string;
  proposedContent: string;
}

export class ProjectApiError extends Error {
  conflicts?: ProjectFileConflict[];
}

async function json<T>(response: Response): Promise<T> {
  if (response.ok) return response.json() as Promise<T>;
  const body = await response.json().catch(() => ({}));
  const error = new ProjectApiError((body as { error?: string }).error ?? `HTTP ${response.status}`);
  const conflicts = (body as { conflicts?: unknown }).conflicts;
  if (Array.isArray(conflicts)) error.conflicts = conflicts as ProjectFileConflict[];
  throw error;
}

export async function listProjectV2(): Promise<ProjectIndexEntry[]> {
  return json(await fetch("/api/v2/projects"));
}

export async function getPreviewSafetyStatus(): Promise<PreviewSafetyStatus> {
  return json(await fetch("/api/v2/preview/safety"));
}

export async function exportPreviewFeedback(
  destinationDirectory: string,
  feedback: PreviewFeedbackInput,
): Promise<PreviewFeedbackExport> {
  return json(await fetch("/api/v2/preview/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ destinationDirectory, feedback }),
  }));
}

export async function createProjectV2(input: CreateProjectInput): Promise<ProjectRecord> {
  return json(
    await fetch("/api/v2/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function openProjectV2(directory: string): Promise<ProjectRecord> {
  return json(
    await fetch("/api/v2/projects/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directory }),
    }),
  );
}

export async function getProjectV2(id: string): Promise<ProjectRecord> {
  return json(await fetch(`/api/v2/projects/${encodeURIComponent(id)}`));
}

export async function exportProjectV2(
  id: string,
  destinationDirectory: string,
  format: "folder" | "zip" = "folder",
): Promise<ProjectExport> {
  return json(
    await fetch(`/api/v2/projects/${encodeURIComponent(id)}/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ destinationDirectory, format }),
    }),
  );
}

export async function removeProjectV2FromIndex(id: string): Promise<void> {
  await json(
    await fetch(`/api/v2/projects/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  );
}

async function mutateProject(path: string, method: string, body?: unknown): Promise<ProjectRecord> {
  return json(
    await fetch(path, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    }),
  );
}

export function addProjectPage(id: string, input: CreateProjectPageInput): Promise<ProjectRecord> {
  return mutateProject(`/api/v2/projects/${encodeURIComponent(id)}/pages`, "POST", input);
}

export function renameProjectPage(id: string, pageId: string, input: RenameProjectPageInput): Promise<ProjectRecord> {
  return mutateProject(
    `/api/v2/projects/${encodeURIComponent(id)}/pages/${encodeURIComponent(pageId)}`,
    "PATCH",
    input,
  );
}

export function reorderProjectPages(id: string, pageIds: string[]): Promise<ProjectRecord> {
  return mutateProject(`/api/v2/projects/${encodeURIComponent(id)}/pages/order`, "PUT", { pageIds });
}

export function removeProjectPage(id: string, pageId: string, cascade = false): Promise<ProjectRecord> {
  return mutateProject(
    `/api/v2/projects/${encodeURIComponent(id)}/pages/${encodeURIComponent(pageId)}?cascade=${cascade}`,
    "DELETE",
  );
}

export function addExperienceFlow(id: string, input: CreateExperienceFlowInput): Promise<ProjectRecord> {
  return mutateProject(`/api/v2/projects/${encodeURIComponent(id)}/flows`, "POST", input);
}

export function renameExperienceFlow(
  id: string,
  flowId: string,
  input: RenameExperienceFlowInput,
): Promise<ProjectRecord> {
  return mutateProject(
    `/api/v2/projects/${encodeURIComponent(id)}/flows/${encodeURIComponent(flowId)}`,
    "PATCH",
    input,
  );
}

export function removeExperienceFlow(id: string, flowId: string): Promise<ProjectRecord> {
  return mutateProject(
    `/api/v2/projects/${encodeURIComponent(id)}/flows/${encodeURIComponent(flowId)}`,
    "DELETE",
  );
}

export async function validateExperienceFlow(
  id: string,
  flowId: string,
): Promise<{ record: ProjectRecord; validation: ProjectFlowValidation }> {
  return json(
    await fetch(`/api/v2/projects/${encodeURIComponent(id)}/flows/${encodeURIComponent(flowId)}/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runCompleted: true }),
    }),
  );
}

export function completeExperienceFlow(id: string, flowId: string, input: CompleteExperienceFlowInput): Promise<ProjectRecord> {
  return mutateProject(`/api/v2/projects/${encodeURIComponent(id)}/flows/${encodeURIComponent(flowId)}/complete`, "POST", input);
}

export async function getExperienceFlowReview(id: string, flowId: string): Promise<ProjectFlowReview | null> {
  return json(await fetch(`/api/v2/projects/${encodeURIComponent(id)}/flows/${encodeURIComponent(flowId)}/review`));
}

export function projectPreviewUrl(id: string, path: string): string {
  return `/api/v2/projects/${encodeURIComponent(id)}/files/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

export interface ProjectFileReplacement {
  path: string;
  content: string;
}

export interface ProjectChangeImpact {
  level: "local" | "shared";
  changedFiles: string[];
  affectedPageIds: string[];
  affectedPageTitles: string[];
  requiresConfirmation: boolean;
  impactHash: string;
}

export async function generateProjectChange(
  id: string,
  input: { pageId: string; prompt: string; skillId?: string },
): Promise<{ files: ProjectFileReplacement[]; impact: ProjectChangeImpact }> {
  return json(
    await fetch(`/api/v2/projects/${encodeURIComponent(id)}/generate-change`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function generateProjectScope(
  id: string,
  input: { mode: "global-draft" | "flow-deepening"; flowId?: string; prompt?: string; skillId?: string },
): Promise<{ files: ProjectFileReplacement[]; impact: ProjectChangeImpact; scope: string; flowSteps?: ProjectFlowAutomationUpdate[] }> {
  return json(
    await fetch(`/api/v2/projects/${encodeURIComponent(id)}/generate-scope`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function commitProjectFiles(
  id: string,
  files: ProjectFileReplacement[],
  confirmedImpactHash?: string,
  deepenedFlowId?: string,
  flowSteps?: ProjectFlowAutomationUpdate[],
): Promise<{ record: ProjectRecord; impact: ProjectChangeImpact; regression: ProjectFlowRegressionResult[] }> {
  return json(
    await fetch(`/api/v2/projects/${encodeURIComponent(id)}/changes/commit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        files,
        ...(confirmedImpactHash ? { confirmedImpactHash } : {}),
        ...(deepenedFlowId ? { deepenedFlowId } : {}),
        ...(flowSteps ? { flowSteps } : {}),
      }),
    }),
  );
}

export async function snapshotProjectVersion(id: string, label: string): Promise<ProjectVersion> {
  return json(await fetch(`/api/v2/projects/${encodeURIComponent(id)}/versions`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label }),
  }));
}

export async function listProjectVersions(id: string): Promise<ProjectVersion[]> {
  return json(await fetch(`/api/v2/projects/${encodeURIComponent(id)}/versions`));
}

export async function restoreProjectVersion(id: string, versionId: string): Promise<{ version: ProjectVersion }> {
  return json(await fetch(`/api/v2/projects/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/restore`, { method: "POST" }));
}

export async function createProjectVariant(id: string, label: string): Promise<ProjectVariant> {
  return json(await fetch(`/api/v2/projects/${encodeURIComponent(id)}/variants`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label }),
  }));
}

export async function listProjectVariants(id: string): Promise<ProjectVariant[]> {
  return json(await fetch(`/api/v2/projects/${encodeURIComponent(id)}/variants`));
}

export async function acceptProjectVariant(id: string, variantId: string): Promise<{ version: ProjectVersion }> {
  return json(await fetch(`/api/v2/projects/${encodeURIComponent(id)}/variants/${encodeURIComponent(variantId)}/accept`, { method: "POST" }));
}

export async function checkExternalProjectChanges(id: string): Promise<{
  changedFiles: string[];
  version?: ProjectVersion;
  record: ProjectRecord;
  regression: ProjectFlowRegressionResult[];
}> {
  return json(await fetch(`/api/v2/projects/${encodeURIComponent(id)}/external-changes/check`, { method: "POST" }));
}

export async function getExternalProjectWatchStatus(id: string): Promise<{ dirty: boolean }> {
  return json(await fetch(`/api/v2/projects/${encodeURIComponent(id)}/external-changes/status`));
}
