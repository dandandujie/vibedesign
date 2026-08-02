import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join, relative } from "node:path";
import type { ProjectVariant, ProjectVersion } from "../../shared/project.js";
import { readJsonFile, writeJsonAtomic } from "./jsonFile.js";
import { createExternalFileState, refreshExternalBaseline } from "./projectExternalState.js";
import { ProjectRepository, ProjectRepositoryError } from "./projectRepository.js";

type VersionIndex = { schemaVersion: 1; versions: ProjectVersion[] };
type VariantIndex = { schemaVersion: 1; variants: ProjectVariant[] };

const PUBLIC_ROOTS = ["vibedesign.json", "tokens.css", "pages", "components", "assets"];

function files(root: string, directory = root): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (directory === root && entry.name === ".vibedesign") continue;
    const absolute = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new ProjectRepositoryError("UNSAFE_PATH", "project snapshots do not follow symbolic links");
    if (entry.isDirectory()) out.push(...files(root, absolute));
    else if (entry.isFile()) out.push(relative(root, absolute).replace(/\\/g, "/"));
  }
  return out;
}

function copySnapshot(root: string, target: string): string[] {
  const paths = files(root);
  for (const path of paths) {
    const destination = join(target, ...path.split("/"));
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(root, ...path.split("/")), destination);
  }
  return paths;
}

function versionIndex(root: string): string { return join(root, ".vibedesign", "versions", "index.json"); }
function variantIndex(root: string): string { return join(root, ".vibedesign", "variants", "index.json"); }

export function listProjectVersions(repository: ProjectRepository, projectId: string): ProjectVersion[] {
  const record = repository.get(projectId);
  return readJsonFile<VersionIndex>(versionIndex(record.directory), { schemaVersion: 1, versions: [] }).versions.sort((a, b) => b.createdAt - a.createdAt);
}

export function snapshotProject(
  repository: ProjectRepository,
  projectId: string,
  input: { label: string; source: ProjectVersion["source"]; changedFiles?: string[]; restoreFromVersionId?: string },
): ProjectVersion {
  const record = repository.get(projectId);
  const root = record.directory;
  const id = `version-${randomUUID()}`;
  const snapshotRoot = join(root, ".vibedesign", "versions", id, "files");
  const changedFiles = input.changedFiles?.length ? input.changedFiles : copySnapshot(root, snapshotRoot);
  if (input.changedFiles?.length) copySnapshot(root, snapshotRoot);
  const version: ProjectVersion = {
    id,
    label: input.label.trim() || "未命名版本",
    source: input.source,
    createdAt: Date.now(),
    changedFiles,
    ...(input.restoreFromVersionId ? { restoreFromVersionId: input.restoreFromVersionId } : {}),
  };
  writeJsonAtomic(join(root, ".vibedesign", "versions", id, "version.json"), version);
  const index = readJsonFile<VersionIndex>(versionIndex(root), { schemaVersion: 1, versions: [] });
  index.versions.push(version);
  writeJsonAtomic(versionIndex(root), index);
  refreshExternalBaseline(root);
  return version;
}

function restoreSnapshot(repository: ProjectRepository, projectId: string, snapshotRoot: string, label: string, restoreFromVersionId?: string): { version: ProjectVersion } {
  const record = repository.get(projectId);
  const root = record.directory;
  if (!existsSync(join(snapshotRoot, "vibedesign.json"))) throw new ProjectRepositoryError("INVALID_PROJECT", "version snapshot is incomplete");
  const transaction = join(root, ".vibedesign", "restore", randomUUID());
  const staged = join(transaction, "staged");
  const backup = join(transaction, "backup");
  mkdirSync(staged, { recursive: true });
  copySnapshot(snapshotRoot, staged);
  const moved: string[] = [];
  try {
    for (const name of PUBLIC_ROOTS) {
      const current = join(root, name);
      const old = join(backup, name);
      if (existsSync(current)) { mkdirSync(dirname(old), { recursive: true }); renameSync(current, old); moved.push(name); }
      const next = join(staged, name);
      if (existsSync(next)) renameSync(next, current);
    }
    repository.open(root);
    const restored = snapshotProject(repository, projectId, {
      label,
      source: "restore",
      ...(restoreFromVersionId ? { restoreFromVersionId } : {}),
    });
    return { version: restored };
  } catch (error) {
    for (const name of PUBLIC_ROOTS) {
      const current = join(root, name);
      if (existsSync(current)) rmSync(current, { recursive: true, force: true });
      const old = join(backup, name);
      if (existsSync(old)) renameSync(old, current);
    }
    throw error;
  } finally {
    if (existsSync(transaction)) rmSync(transaction, { recursive: true, force: true });
  }
}

export function restoreProjectVersion(repository: ProjectRepository, projectId: string, versionId: string): { version: ProjectVersion } {
  const record = repository.get(projectId);
  const version = listProjectVersions(repository, projectId).find((item) => item.id === versionId);
  if (!version) throw new ProjectRepositoryError("NOT_FOUND", "project version not found");
  return restoreSnapshot(repository, projectId, join(record.directory, ".vibedesign", "versions", versionId, "files"), `恢复 ${version.label}`, version.id);
}

export function createProjectVariant(repository: ProjectRepository, projectId: string, label: string): ProjectVariant {
  const record = repository.get(projectId);
  const root = record.directory;
  const id = `variant-${randomUUID()}`;
  const target = join(root, ".vibedesign", "variants", id, "files");
  copySnapshot(root, target);
  const variant: ProjectVariant = { id, label: label.trim() || "未命名变体", createdAt: Date.now(), baseVersionId: listProjectVersions(repository, projectId)[0]?.id };
  writeJsonAtomic(join(root, ".vibedesign", "variants", id, "variant.json"), variant);
  const index = readJsonFile<VariantIndex>(variantIndex(root), { schemaVersion: 1, variants: [] });
  index.variants.push(variant);
  writeJsonAtomic(variantIndex(root), index);
  return variant;
}

export function listProjectVariants(repository: ProjectRepository, projectId: string): ProjectVariant[] {
  const record = repository.get(projectId);
  return readJsonFile<VariantIndex>(variantIndex(record.directory), { schemaVersion: 1, variants: [] }).variants
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function acceptProjectVariant(repository: ProjectRepository, projectId: string, variantId: string): { version: ProjectVersion } {
  const record = repository.get(projectId);
  const variants = readJsonFile<VariantIndex>(variantIndex(record.directory), { schemaVersion: 1, variants: [] }).variants;
  const variant = variants.find((item) => item.id === variantId);
  if (!variant) throw new ProjectRepositoryError("NOT_FOUND", "project variant not found");
  snapshotProject(repository, projectId, { label: `接受变体前：${variant.label}`, source: "manual" });
  return restoreSnapshot(repository, projectId, join(record.directory, ".vibedesign", "variants", variant.id, "files"), `接受变体：${variant.label}`);
}

export function detectExternalProjectChanges(repository: ProjectRepository, projectId: string): { changedFiles: string[]; version?: ProjectVersion } {
  const record = repository.get(projectId);
  const current = createExternalFileState(record.directory);
  const previous = readJsonFile<typeof current>(join(record.directory, ".vibedesign", "external-state.json"), { schemaVersion: 1, files: {} });
  if (!Object.keys(previous.files).length) { refreshExternalBaseline(record.directory); return { changedFiles: [] }; }
  const paths = new Set([...Object.keys(current.files), ...Object.keys(previous.files)]);
  const changedFiles = [...paths].filter((path) => current.files[path] !== previous.files[path]).sort();
  if (!changedFiles.length) return { changedFiles };
  const version = snapshotProject(repository, projectId, { label: "外部修改", source: "external", changedFiles });
  return { changedFiles, version };
}
