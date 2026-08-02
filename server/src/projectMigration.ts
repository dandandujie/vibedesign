import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, join } from "node:path";
import type { ExperienceFlow, ProjectManifest, ProjectPage } from "../../shared/project.js";
import { PROJECT_SCHEMA, PROJECT_SCHEMA_VERSION } from "../../shared/project.js";
import { writeJsonAtomic } from "./jsonFile.js";
import { defaultViewports, isSafeProjectRelativePath, parseProjectManifest } from "./projectManifest.js";
import { ProjectRepository, ProjectRepositoryError } from "./projectRepository.js";

type LegacyArtifact = {
  id?: unknown;
  html?: unknown;
  label?: unknown;
  createdAt?: unknown;
  kind?: unknown;
  files?: unknown;
  entry?: unknown;
  site?: unknown;
};

type LegacyProject = {
  id?: unknown;
  name?: unknown;
  artifacts?: unknown;
  activeVersionId?: unknown;
  updatedAt?: unknown;
  favorite?: unknown;
  comments?: unknown;
};

export type LegacyMigrationStatus = "migrated" | "skipped" | "readonly" | "failed";

export interface LegacyMigrationResult {
  legacyProjectId: string;
  name: string;
  status: LegacyMigrationStatus;
  projectId?: string;
  directory?: string;
  reason?: string;
  warnings: string[];
}

export interface LegacyMigrationReport {
  schemaVersion: 1;
  startedAt: number;
  completedAt: number;
  sourceFile: string;
  backupFile: string;
  sourceSha256?: string;
  backupSha256?: string;
  targetParentDirectory: string;
  counts: Record<LegacyMigrationStatus, number>;
  results: LegacyMigrationResult[];
}

type MigrationStateEntry = {
  status: Exclude<LegacyMigrationStatus, "skipped">;
  projectId?: string;
  directory?: string;
  reason?: string;
};

interface LegacyMigrationState {
  schemaVersion: 1;
  projects: Record<string, MigrationStateEntry>;
  lastReport?: LegacyMigrationReport;
}

export class ProjectMigrationError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "INVALID_SOURCE" | "INVALID_STATE",
    message: string,
    readonly report?: LegacyMigrationReport,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export interface MigrateLegacyProjectsInput {
  legacyFile: string;
  targetParentDirectory: string;
  stateFile: string;
  backupDirectory: string;
  repository: ProjectRepository;
  now?: () => number;
}

const MIGRATED_TOKENS = `:root {
  --color-canvas: #ffffff;
  --color-text: #171717;
  --font-sans: Inter, ui-sans-serif, system-ui, sans-serif;
  --space-md: 16px;
  --radius-md: 12px;
}
`;

function stableId(prefix: string, value: string): string {
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 20)}`;
}

function asTimestamp(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function migrationState(file: string): LegacyMigrationState {
  if (!existsSync(file)) return { schemaVersion: 1, projects: {} };
  try {
    const value = JSON.parse(readFileSync(file, "utf8")) as Partial<LegacyMigrationState>;
    if (value.schemaVersion !== 1 || !value.projects || typeof value.projects !== "object" || Array.isArray(value.projects)) {
      throw new Error("unsupported migration state");
    }
    return value as LegacyMigrationState;
  } catch (error) {
    throw new ProjectMigrationError("INVALID_STATE", "旧项目迁移状态无效，未执行迁移", undefined, { cause: error });
  }
}

function backupSource(sourceFile: string, backupDirectory: string, now: number): string {
  mkdirSync(backupDirectory, { recursive: true });
  const extension = basename(sourceFile).replace(/[^a-zA-Z0-9._-]/g, "-");
  const backupFile = join(backupDirectory, `${extension}.${now}-${randomUUID()}.bak`);
  copyFileSync(sourceFile, backupFile);
  return backupFile;
}

function artifactIsUsable(value: LegacyArtifact): boolean {
  if (value.kind === "markdown") return false;
  if (typeof value.html === "string" && value.html.trim()) return true;
  if (!value.files || typeof value.files !== "object" || Array.isArray(value.files)) return false;
  return Object.values(value.files).some((content) => typeof content === "string");
}

function currentArtifact(project: LegacyProject): { artifact: LegacyArtifact; fallback: boolean } | undefined {
  if (!Array.isArray(project.artifacts)) return undefined;
  const artifacts = project.artifacts.filter(
    (value): value is LegacyArtifact => Boolean(value) && typeof value === "object" && artifactIsUsable(value as LegacyArtifact),
  );
  if (!artifacts.length) return undefined;
  if (typeof project.activeVersionId === "string") {
    const active = artifacts.find((artifact) => artifact.id === project.activeVersionId);
    if (active) return { artifact: active, fallback: false };
  }
  return { artifact: artifacts[artifacts.length - 1], fallback: project.activeVersionId !== undefined };
}

function pageId(projectId: string, path: string): string {
  return stableId("page", `${projectId}:${path}`);
}

function buildSinglePage(
  projectId: string,
  projectName: string,
  artifact: LegacyArtifact,
): { files: Record<string, string>; pages: ProjectPage[]; flows: ExperienceFlow[]; entryPageId: string; warnings: string[] } {
  if (typeof artifact.html !== "string" || !artifact.html.trim()) {
    throw new Error("当前单页版本没有可迁移的 HTML");
  }
  const path = "pages/index.html";
  const id = pageId(projectId, path);
  return {
    files: { [path]: artifact.html, "tokens.css": MIGRATED_TOKENS },
    pages: [{ id, path, title: projectName, status: "draft" }],
    flows: [],
    entryPageId: id,
    warnings: [],
  };
}

function normalizeLegacyPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function buildMultiFile(
  projectId: string,
  artifact: LegacyArtifact,
): { files: Record<string, string>; pages: ProjectPage[]; flows: ExperienceFlow[]; entryPageId: string; warnings: string[] } {
  if (!artifact.files || typeof artifact.files !== "object" || Array.isArray(artifact.files)) {
    throw new Error("多文件版本缺少 files");
  }
  const sourceFiles = artifact.files as Record<string, unknown>;
  const files: Record<string, string> = {};
  const normalizedSource = new Map<string, string>();
  for (const [rawPath, content] of Object.entries(sourceFiles)) {
    const path = normalizeLegacyPath(rawPath);
    if (!isSafeProjectRelativePath(path)) throw new Error(`多文件版本包含不安全路径：${rawPath}`);
    if (typeof content !== "string") throw new Error(`多文件版本包含非文本文件：${rawPath}`);
    if (normalizedSource.has(path)) throw new Error(`多文件版本包含重复路径：${rawPath}`);
    normalizedSource.set(path, content);
    files[`pages/${path}`] = content;
  }
  if (!normalizedSource.size) throw new Error("多文件版本没有可迁移文件");

  const site =
    artifact.site && typeof artifact.site === "object" && !Array.isArray(artifact.site)
      ? (artifact.site as { pages?: unknown; flows?: unknown })
      : undefined;
  const declaredPages = Array.isArray(site?.pages)
    ? site.pages
        .filter((value): value is { path: string; title?: unknown } => {
          return Boolean(value) && typeof value === "object" && typeof (value as { path?: unknown }).path === "string";
        })
        .map((value) => ({ path: normalizeLegacyPath(value.path), title: value.title }))
    : [];
  const pageCandidates = declaredPages.length
    ? declaredPages
    : [...normalizedSource.keys()].filter((path) => /\.html?$/i.test(path)).map((path) => ({ path, title: undefined }));
  if (!pageCandidates.length) throw new Error("多文件版本没有可识别的 HTML 页面");

  const seenPages = new Set<string>();
  const pages: ProjectPage[] = [];
  for (const candidate of pageCandidates) {
    if (!isSafeProjectRelativePath(candidate.path) || !normalizedSource.has(candidate.path)) {
      throw new Error(`页面清单引用了不存在或不安全的文件：${candidate.path}`);
    }
    if (seenPages.has(candidate.path)) throw new Error(`页面清单包含重复页面：${candidate.path}`);
    seenPages.add(candidate.path);
    const path = `pages/${candidate.path}`;
    pages.push({
      id: pageId(projectId, path),
      path,
      title: typeof candidate.title === "string" && candidate.title.trim() ? candidate.title.trim() : basename(candidate.path),
      status: "draft",
    });
  }

  const pagesByLegacyPath = new Map(pages.map((page) => [page.path.slice("pages/".length), page]));
  const warnings: string[] = [];
  const flows: ExperienceFlow[] = [];
  if (Array.isArray(site?.flows)) {
    for (const [flowIndex, value] of site.flows.entries()) {
      if (!value || typeof value !== "object") continue;
      const flow = value as { name?: unknown; steps?: unknown };
      if (!Array.isArray(flow.steps) || !flow.steps.every((step) => typeof step === "string")) continue;
      const referencedPages = flow.steps.map((step) => pagesByLegacyPath.get(normalizeLegacyPath(step)));
      if (referencedPages.some((page) => !page)) {
        warnings.push(`流程“${typeof flow.name === "string" ? flow.name : flowIndex + 1}”引用未知页面，已跳过`);
        continue;
      }
      const name = typeof flow.name === "string" && flow.name.trim() ? flow.name.trim() : `流程 ${flowIndex + 1}`;
      flows.push({
        id: stableId("flow", `${projectId}:${flowIndex}:${name}`),
        name,
        status: "draft",
        steps: referencedPages.map((page, stepIndex) => ({
          id: stableId("step", `${projectId}:${flowIndex}:${stepIndex}`),
          pageId: page!.id,
          action: stepIndex === 0 ? `打开“${page!.title}”` : `前往“${page!.title}”`,
          expected: `显示“${page!.title}”页面`,
          commands: [
            { type: "open" },
            { type: "expect-visible", target: { by: "role", value: "heading", name: page!.title } },
          ],
        })),
      });
    }
  }

  const requestedEntry = typeof artifact.entry === "string" ? normalizeLegacyPath(artifact.entry) : undefined;
  const entry = (requestedEntry && pagesByLegacyPath.get(requestedEntry)) || pages[0];
  if (requestedEntry && !pagesByLegacyPath.has(requestedEntry)) {
    warnings.push(`入口文件“${requestedEntry}”不在页面清单中，已使用第一个页面`);
  }
  files["tokens.css"] = normalizedSource.get("styles.css") ?? MIGRATED_TOKENS;
  return { files, pages, flows, entryPageId: entry.id, warnings };
}

function emptyReport(
  sourceFile: string,
  backupFile: string,
  targetParentDirectory: string,
  startedAt: number,
): LegacyMigrationReport {
  return {
    schemaVersion: 1,
    startedAt,
    completedAt: startedAt,
    sourceFile,
    backupFile,
    targetParentDirectory,
    counts: { migrated: 0, skipped: 0, readonly: 0, failed: 0 },
    results: [],
  };
}

function finishReport(report: LegacyMigrationReport, completedAt: number): LegacyMigrationReport {
  report.completedAt = completedAt;
  report.counts = { migrated: 0, skipped: 0, readonly: 0, failed: 0 };
  for (const result of report.results) report.counts[result.status] += 1;
  return report;
}

export function readLegacyMigrationReport(stateFile: string): LegacyMigrationReport | undefined {
  return migrationState(stateFile).lastReport;
}

export function migrateLegacyProjects(input: MigrateLegacyProjectsInput): LegacyMigrationReport {
  if (!existsSync(input.legacyFile)) {
    throw new ProjectMigrationError("NOT_FOUND", "未找到旧 projects.json");
  }
  if (
    !isAbsolute(input.targetParentDirectory) ||
    !existsSync(input.targetParentDirectory) ||
    !statSync(input.targetParentDirectory).isDirectory()
  ) {
    throw new ProjectMigrationError("NOT_FOUND", "迁移目标目录不存在或不是绝对路径");
  }
  const clock = input.now ?? Date.now;
  const startedAt = clock();
  const backupFile = backupSource(input.legacyFile, input.backupDirectory, startedAt);
  const report = emptyReport(input.legacyFile, backupFile, input.targetParentDirectory, startedAt);
  report.sourceSha256 = createHash("sha256").update(readFileSync(input.legacyFile)).digest("hex");
  report.backupSha256 = createHash("sha256").update(readFileSync(backupFile)).digest("hex");
  const state = migrationState(input.stateFile);

  let projects: unknown;
  try {
    projects = JSON.parse(readFileSync(input.legacyFile, "utf8"));
    if (!Array.isArray(projects)) throw new Error("projects.json root must be an array");
  } catch (error) {
    report.results.push({
      legacyProjectId: "(source)",
      name: "projects.json",
      status: "failed",
      reason: "旧 projects.json 不是有效的项目数组",
      warnings: [],
    });
    finishReport(report, clock());
    state.lastReport = report;
    mkdirSync(dirname(input.stateFile), { recursive: true });
    writeJsonAtomic(input.stateFile, state);
    throw new ProjectMigrationError("INVALID_SOURCE", "旧 projects.json 无效；原文件未修改，完整备份已保留", report, {
      cause: error,
    });
  }

  for (const [projectIndex, rawProject] of projects.entries()) {
    const project = rawProject && typeof rawProject === "object" ? (rawProject as LegacyProject) : {};
    const legacyProjectId =
      typeof project.id === "string" && project.id.trim() ? project.id : stableId("unknown", String(projectIndex));
    const name = typeof project.name === "string" && project.name.trim() ? project.name.trim() : `旧项目 ${projectIndex + 1}`;
    const previous = state.projects[legacyProjectId];
    if (previous?.status === "migrated") {
      report.results.push({
        legacyProjectId,
        name,
        status: "skipped",
        projectId: previous.projectId,
        directory: previous.directory,
        reason: "该旧项目已迁移",
        warnings: [],
      });
      continue;
    }

    const selected = currentArtifact(project);
    if (!selected) {
      const reason = "没有可可靠识别的 HTML 或多文件 UI/UX 版本；继续由旧 API 只读兼容";
      report.results.push({ legacyProjectId, name, status: "readonly", reason, warnings: [] });
      state.projects[legacyProjectId] = { status: "readonly", reason };
      continue;
    }

    const projectId = stableId("legacy", legacyProjectId);
    const warnings = ["旧项目未记录目标平台，迁移后默认使用 Web"];
    if (selected.fallback) warnings.push("activeVersionId 无效，已使用最新有效版本");
    try {
      const built =
        selected.artifact.kind === "multifile" || selected.artifact.files
          ? buildMultiFile(projectId, selected.artifact)
          : buildSinglePage(projectId, name, selected.artifact);
      warnings.push(...built.warnings);
      const createdAt = asTimestamp(selected.artifact.createdAt, startedAt);
      const manifest = parseProjectManifest({
        schema: PROJECT_SCHEMA,
        schemaVersion: PROJECT_SCHEMA_VERSION,
        id: projectId,
        name,
        platform: "web",
        createdAt,
        updatedAt: asTimestamp(project.updatedAt, createdAt),
        entryPageId: built.entryPageId,
        viewports: defaultViewports("web"),
        pages: built.pages,
        flows: built.flows,
        assets: [],
        designLanguage: {
          tokens: "tokens.css",
          componentsDir: "components",
          source: { type: "import", id: "legacy-projects-v1" },
        },
      } satisfies ProjectManifest);
      const record = input.repository.importProject({
        parentDirectory: input.targetParentDirectory,
        folderName: `${name}-migrated-${createHash("sha256").update(legacyProjectId).digest("hex").slice(0, 8)}`,
        manifest,
        files: built.files,
        favorite: project.favorite === true,
        comments: Array.isArray(project.comments) ? project.comments : [],
        legacySnapshot: rawProject,
      });
      report.results.push({
        legacyProjectId,
        name,
        status: "migrated",
        projectId,
        directory: record.directory,
        warnings,
      });
      state.projects[legacyProjectId] = { status: "migrated", projectId, directory: record.directory };
    } catch (error) {
      const reason =
        error instanceof ProjectRepositoryError && error.code === "ALREADY_EXISTS"
          ? "目标目录已存在，未覆盖"
          : error instanceof Error
            ? error.message
            : String(error);
      report.results.push({ legacyProjectId, name, status: "failed", projectId, reason, warnings });
      state.projects[legacyProjectId] = { status: "failed", projectId, reason };
    }
  }

  finishReport(report, clock());
  state.lastReport = report;
  mkdirSync(dirname(input.stateFile), { recursive: true });
  writeJsonAtomic(input.stateFile, state);
  return report;
}
