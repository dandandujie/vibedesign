import { createHash } from "node:crypto";
import type { ProjectFlowAutomationUpdate, ProjectManifest } from "../../shared/project.js";
import { isSafeProjectRelativePath } from "./projectManifest.js";
import { ProjectRepository, ProjectRepositoryError } from "./projectRepository.js";

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

export interface ProjectChangeConflict {
  path: string;
  currentContent: string;
  proposedContent: string;
}

export class ProjectChangeConflictError extends Error {
  constructor(readonly conflicts: ProjectChangeConflict[]) {
    super("project files changed since this proposal was created");
  }
}

function normalizeReplacements(files: ProjectFileReplacement[]): ProjectFileReplacement[] {
  if (!Array.isArray(files) || !files.length) {
    throw new ProjectRepositoryError("INVALID_INPUT", "at least one replacement file is required");
  }
  const seen = new Set<string>();
  return files.map((file) => {
    const path = String(file?.path ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (
      !isSafeProjectRelativePath(path) ||
      path === "vibedesign.json" ||
      path.startsWith(".vibedesign/") ||
      typeof file?.content !== "string"
    ) {
      throw new ProjectRepositoryError("UNSAFE_PATH", `unsafe project replacement: ${path}`);
    }
    if (seen.has(path)) throw new ProjectRepositoryError("INVALID_INPUT", `duplicate replacement path: ${path}`);
    seen.add(path);
    return { path, content: file.content };
  });
}

function changeHash(projectId: string, updatedAt: number, files: ProjectFileReplacement[], currentFiles: string[] = []): string {
  const hash = createHash("sha256");
  hash.update(projectId);
  hash.update(String(updatedAt));
  for (const file of files) {
    hash.update("\0");
    hash.update(file.path);
    hash.update("\0");
    hash.update(file.content);
  }
  for (const current of currentFiles) { hash.update("\0current\0"); hash.update(current); }
  return hash.digest("hex");
}

export function analyzeProjectChange(
  manifest: ProjectManifest,
  files: ProjectFileReplacement[],
): { files: ProjectFileReplacement[]; impact: ProjectChangeImpact } {
  const normalized = normalizeReplacements(files);
  const shared = normalized.some(
    (file) =>
      file.path === manifest.designLanguage.tokens ||
      file.path === manifest.designLanguage.componentsDir ||
      file.path.startsWith(`${manifest.designLanguage.componentsDir}/`),
  );
  const affectedPages = shared
    ? manifest.pages
    : manifest.pages.filter((page) => normalized.some((file) => file.path === page.path));
  if (!shared && affectedPages.length === 0) {
    throw new ProjectRepositoryError(
      "INVALID_INPUT",
      "local changes must replace a declared page; shared changes must target tokens or components",
    );
  }
  return {
    files: normalized,
    impact: {
      level: shared ? "shared" : "local",
      changedFiles: normalized.map((file) => file.path),
      affectedPageIds: affectedPages.map((page) => page.id),
      affectedPageTitles: affectedPages.map((page) => page.title),
      requiresConfirmation: shared,
      impactHash: changeHash(manifest.id, manifest.updatedAt, normalized),
    },
  };
}

export function planProjectChange(
  repository: ProjectRepository,
  projectId: string,
  files: ProjectFileReplacement[],
): ProjectChangeImpact {
  const record = repository.get(projectId);
  const analyzed = analyzeProjectChange(record.manifest, files);
  const currentFiles = analyzed.files.map((file) => {
    try { return repository.readPreviewFile(projectId, file.path).body.toString("base64"); }
    catch { return "<missing>"; }
  });
  return { ...analyzed.impact, impactHash: changeHash(record.manifest.id, record.manifest.updatedAt, analyzed.files, currentFiles) };
}

export function commitProjectChange(
  repository: ProjectRepository,
  projectId: string,
  files: ProjectFileReplacement[],
  confirmedImpactHash?: string,
  intent?: { deepenedFlowId?: string; flowSteps?: ProjectFlowAutomationUpdate[] },
  beforeCommit?: () => unknown,
) {
  const record = repository.get(projectId);
  const analyzed = analyzeProjectChange(record.manifest, files);
  const planned = planProjectChange(repository, projectId, files);
  if (confirmedImpactHash && confirmedImpactHash !== planned.impactHash) {
    const conflicts = analyzed.files.map((file) => {
      try {
        return {
          path: file.path,
          currentContent: repository.readPreviewFile(projectId, file.path).body.toString("utf8"),
          proposedContent: file.content,
        };
      } catch {
        return { path: file.path, currentContent: "", proposedContent: file.content };
      }
    });
    throw new ProjectChangeConflictError(conflicts);
  }
  if (analyzed.impact.requiresConfirmation && confirmedImpactHash !== planned.impactHash) {
    throw new ProjectRepositoryError("INVALID_INPUT", "shared change requires confirmation of the current impact");
  }
  const checkpoint = beforeCommit?.();
  const updated = repository.replaceProjectFiles(projectId, analyzed.files, analyzed.impact.affectedPageIds, intent);
  return { record: updated, impact: planned, ...(checkpoint === undefined ? {} : { checkpoint }) };
}
