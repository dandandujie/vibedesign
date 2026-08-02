import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type {
  PreviewDiagnostics,
  PreviewFeedbackExport,
  PreviewFeedbackInput,
  PreviewSafetyStatus,
} from "../../shared/project.js";
import { readLegacyMigrationReport } from "./projectMigration.js";
import { ProjectRepository, ProjectRepositoryError } from "./projectRepository.js";

const FEEDBACK_EXCLUDES = [
  "项目名称与 ID",
  "项目和备份路径",
  "页面源码与视觉资源",
  "提示词、聊天记录与模型配置",
  "API Key 和其他凭据",
];

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function trySha256(file: string): string | null {
  try {
    return sha256(file);
  } catch {
    return null;
  }
}

function diagnostics(repository: ProjectRepository, migrationStateFile: string): PreviewDiagnostics {
  const entries = repository.list();
  const result: PreviewDiagnostics = {
    projects: {
      total: entries.length,
      missing: entries.filter((entry) => entry.missing).length,
      invalid: entries.filter((entry) => entry.invalid).length,
    },
    pages: 0,
    flows: { draft: 0, "ready-for-review": 0, completed: 0 },
    missingAssets: 0,
  };
  for (const entry of entries) {
    if (entry.missing || entry.invalid) continue;
    try {
      const manifest = repository.get(entry.id).manifest;
      result.pages += manifest.pages.length;
      result.missingAssets += manifest.assets.filter((asset) => asset.status === "missing").length;
      for (const flow of manifest.flows) result.flows[flow.status] += 1;
    } catch {
      // The index summary already reports unavailable projects without exposing their identity.
    }
  }
  const migration = readLegacyMigrationReport(migrationStateFile);
  if (migration) result.migration = { completedAt: migration.completedAt, counts: migration.counts };
  return result;
}

export function previewSafetyStatus(
  repository: ProjectRepository,
  migrationStateFile: string,
  appVersion: string,
): PreviewSafetyStatus {
  const report = readLegacyMigrationReport(migrationStateFile);
  const sourceExists = Boolean(report && existsSync(report.sourceFile));
  const backupExists = Boolean(report && existsSync(report.backupFile));
  const verified = report?.sourceSha256 && report.backupSha256
    ? report.sourceSha256 === report.backupSha256
    : null;
  const currentSourceHash = report && sourceExists ? trySha256(report.sourceFile) : null;
  const currentBackupHash = report && backupExists ? trySha256(report.backupFile) : null;
  const sourceChanged = report?.sourceSha256 && currentSourceHash
    ? currentSourceHash !== report.sourceSha256
    : null;
  const backupIntact = report?.backupSha256 && currentBackupHash ? currentBackupHash === report.backupSha256 : null;
  return {
    schema: "vibedesign.preview-safety",
    schemaVersion: 1,
    app: { version: appVersion, platform: process.platform, arch: process.arch },
    diagnostics: diagnostics(repository, migrationStateFile),
    ...(report
      ? {
          migration: {
            sourceFile: report.sourceFile,
            backupFile: report.backupFile,
            sourceExists,
            backupExists,
            backupVerifiedAtMigration: verified,
            backupIntact,
            sourceChangedSinceMigration: sourceChanged,
          },
        }
      : {}),
    rollbackSteps: [
      "先退出 VibeDesign，避免应用仍在写入本地数据。",
      "保留已迁移的 Project V2 目录；从最近项目移除不会删除这些文件。",
      "旧项目源文件迁移时不会被修改；需要恢复时，用迁移备份替换对应旧源文件。",
      "重新启动后继续使用旧版扩展项目，确认数据无误后再处理预览项目目录。",
    ],
    feedbackExcludes: FEEDBACK_EXCLUDES,
  };
}

function field(value: unknown, name: string, limit: number, required = false): string | undefined {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (required && !normalized) throw new ProjectRepositoryError("INVALID_INPUT", `${name} is required`);
  if (normalized.length > limit) throw new ProjectRepositoryError("INVALID_INPUT", `${name} is too long`);
  return normalized || undefined;
}

export function exportPreviewFeedback(
  repository: ProjectRepository,
  migrationStateFile: string,
  appVersion: string,
  destinationDirectory: string,
  input: PreviewFeedbackInput,
  now = Date.now(),
): PreviewFeedbackExport {
  if (!isAbsolute(destinationDirectory)) throw new ProjectRepositoryError("INVALID_INPUT", "destinationDirectory must be absolute");
  const destination = resolve(destinationDirectory);
  if (!existsSync(destination) || !statSync(destination).isDirectory()) {
    throw new ProjectRepositoryError("NOT_FOUND", "feedback destination directory not found");
  }
  const category = input?.category;
  if (!category || !(["bug", "usability", "migration", "performance", "other"] as const).includes(category)) {
    throw new ProjectRepositoryError("INVALID_INPUT", "invalid feedback category");
  }
  const summary = field(input.summary, "summary", 200, true)!;
  const steps = field(input.steps, "steps", 4000);
  const expected = field(input.expected, "expected", 2000);
  const actual = field(input.actual, "actual", 2000);
  const status = previewSafetyStatus(repository, migrationStateFile, appVersion);
  const createdAt = now;
  const parent = realpathSync(destination);
  const name = `vibedesign-preview-feedback-${new Date(createdAt).toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}.json`;
  const target = join(parent, name);
  const temporary = `${target}.${process.pid}.tmp`;
  const bundle = {
    schema: "vibedesign.preview-feedback",
    schemaVersion: 1,
    createdAt,
    app: status.app,
    issue: { category, summary, ...(steps ? { steps } : {}), ...(expected ? { expected } : {}), ...(actual ? { actual } : {}) },
    diagnostics: status.diagnostics,
    privacy: { excluded: FEEDBACK_EXCLUDES, note: "用户填写的 issue 字段会原样包含。" },
  };
  try {
    writeFileSync(temporary, JSON.stringify(bundle, null, 2), { encoding: "utf8", flag: "wx" });
    renameSync(temporary, target);
  } catch (error) {
    if (existsSync(temporary)) rmSync(temporary, { force: true });
    throw error;
  }
  return { file: target, createdAt };
}
