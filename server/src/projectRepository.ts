import {
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import archiver from "archiver";
import type {
  CompleteExperienceFlowInput,
  CreateExperienceFlowInput,
  CreateProjectPageInput,
  CreateProjectInput,
  ProjectIndexEntry,
  ProjectExport,
  ProjectExportValidation,
  ProjectFlowAutomationUpdate,
  ProjectFlowRuntimeReport,
  ProjectFlowReview,
  ProjectFlowValidation,
  ProjectHandoffBundle,
  ProjectManifest,
  ProjectRecord,
  RenameExperienceFlowInput,
  RenameProjectPageInput,
  RegisterProjectAssetInput,
  ReorderProjectPagesInput,
} from "../../shared/project.js";
import { PROJECT_FLOW_REVIEW_CRITERIA } from "../../shared/project.js";
import { readJsonFile, writeJsonAtomic } from "./jsonFile.js";
import { refreshExternalBaseline } from "./projectExternalState.js";
import { createProjectManifest, isSafeProjectRelativePath, parseProjectManifest } from "./projectManifest.js";
import { ProjectIndexStore } from "./projectIndex.js";
import type { ProjectFileReplacement } from "./projectChanges.js";

export type ProjectRepositoryErrorCode =
  | "INVALID_INPUT"
  | "ALREADY_EXISTS"
  | "NOT_FOUND"
  | "INVALID_PROJECT"
  | "UNSAFE_PATH";

export class ProjectRepositoryError extends Error {
  constructor(
    readonly code: ProjectRepositoryErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export interface ServedProjectFile {
  body: Buffer;
  contentType: string;
}

export interface ImportProjectInput {
  parentDirectory: string;
  folderName?: string;
  manifest: ProjectManifest;
  files: Record<string, string | Buffer>;
  favorite?: boolean;
  comments?: unknown;
  legacySnapshot?: unknown;
}

const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
};

function contentTypeFor(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

function isInside(parent: string, target: string): boolean {
  const value = relative(parent, target);
  return value !== "" && !value.startsWith("..") && !isAbsolute(value);
}

function assertNoSymlinkPath(root: string, target: string): void {
  const parts = relative(root, dirname(target)).split(/[\\/]/).filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      throw new ProjectRepositoryError("UNSAFE_PATH", "project replacement traverses a symbolic link");
    }
  }
}

function projectFolderName(name: string, requested?: string): string {
  const source = (requested || name).normalize("NFKC").trim().toLowerCase();
  const slug = source
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[^\p{Letter}\p{Number}._-]+/gu, "-")
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .slice(0, 64);
  if (!slug || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(slug)) return "vibedesign-project";
  return slug;
}

function pageFileName(title: string, requested?: string): string {
  const raw = projectFolderName(title, requested).replace(/\.html?$/i, "");
  return `${raw || "page"}.html`;
}

function readManifest(directory: string): ProjectManifest {
  const file = join(directory, "vibedesign.json");
  if (!existsSync(file)) throw new ProjectRepositoryError("NOT_FOUND", "vibedesign.json not found");
  try {
    return parseProjectManifest(JSON.parse(readFileSync(file, "utf8")));
  } catch (error) {
    if (error instanceof ProjectRepositoryError) throw error;
    throw new ProjectRepositoryError("INVALID_PROJECT", "invalid vibedesign.json", { cause: error });
  }
}

function indexEntry(directory: string, manifest: ProjectManifest, favorite?: boolean): ProjectIndexEntry {
  return {
    id: manifest.id,
    name: manifest.name,
    directory,
    platform: manifest.platform,
    updatedAt: manifest.updatedAt,
    ...(favorite ? { favorite: true } : {}),
  };
}

function initialPage(name: string): string {
  const safeName = name.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeName}</title>
  <link rel="stylesheet" href="../tokens.css">
</head>
<body>
  <main>
    <h1>${safeName}</h1>
    <p>项目已创建，等待生成第一条体验流程。</p>
  </main>
</body>
</html>
`;
}

function placeholderPage(title: string): string {
  const safeTitle = title.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <link rel="stylesheet" href="../tokens.css">
</head>
<body>
  <main>
    <p>页面草稿</p>
    <h1>${safeTitle}</h1>
  </main>
</body>
</html>
`;
}

function copyPublicProject(sourceRoot: string, targetRoot: string, directory = sourceRoot): string[] {
  const copied: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (directory === sourceRoot && entry.name === ".vibedesign") continue;
    const source = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new ProjectRepositoryError("UNSAFE_PATH", "project export does not follow symbolic links");
    }
    if (entry.isDirectory()) {
      copied.push(...copyPublicProject(sourceRoot, targetRoot, source));
      continue;
    }
    if (!entry.isFile()) continue;
    const path = relative(sourceRoot, source).replace(/\\/g, "/");
    const target = resolve(targetRoot, ...path.split("/"));
    if (!isInside(targetRoot, target)) throw new ProjectRepositoryError("UNSAFE_PATH", "project export escapes destination");
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(source));
    copied.push(path);
  }
  return copied;
}

function archiveProjectDirectory(source: string, target: string, folderName: string): Promise<void> {
  return new Promise((resolveArchive, rejectArchive) => {
    const output = createWriteStream(target, { flags: "wx" });
    const archive = archiver("zip", { zlib: { level: 6 } });
    output.on("close", resolveArchive);
    output.on("error", rejectArchive);
    archive.on("error", rejectArchive);
    archive.pipe(output);
    archive.directory(source, folderName);
    void archive.finalize();
  });
}

function handoffNotes(bundle: ProjectHandoffBundle): string {
  const { manifest } = bundle;
  const pages = manifest.pages.map((page) => `- ${page.title}: \`${page.path}\``).join("\n");
  const flows = bundle.flows.length
    ? bundle.flows.map((flow) => `- ${flow.name}（${flow.status}）: ${flow.steps.map((step) => step.action).join(" → ")}${flow.review ? "；已有设计评审记录" : ""}`).join("\n")
    : "- 当前尚未定义体验流程。";
  const assets = manifest.assets.length
    ? manifest.assets.map((asset) => `- \`${asset.path}\`：${asset.kind} / ${asset.status} / ${asset.source.type}${asset.source.uri ? ` / ${asset.source.uri}` : ""}`).join("\n")
    : "- 当前项目没有登记视觉资源。";
  const validation = bundle.exportValidation.status === "passed"
    ? `已在导出副本中重新运行 ${bundle.exportValidation.flows.length} 条已完成流程，全部通过。`
    : bundle.exportValidation.status === "unverified"
      ? "当前没有已完成流程；这是可继续开发的草稿交付，尚未形成已验证流程。"
      : "导出副本验证失败。";
  return `# ${manifest.name} — VibeDesign 前端交接\n\n这是一个可继续开发的浏览器标准前端原型。它只覆盖 UI/UX 和可替换的模拟状态；请在此基础上接入你自己的数据层、鉴权和后端逻辑。完整机器可读上下文见 \`VIBEDESIGN_HANDOFF.json\`。\n\n## 交付验证\n\n${validation}\n\n## 运行\n\n直接用静态服务器打开入口页面，或把页面、令牌和资源迁移到目标前端框架。不要把 \`vibedesign.json\` 当作运行时依赖；它是设计与交接上下文。\n\n## 页面\n\n${pages}\n\n## 体验流程\n\n${flows}\n\n## 设计语言\n\n- 令牌：\`${manifest.designLanguage.tokens}\`\n- 共享组件目录：\`${manifest.designLanguage.componentsDir}\`\n\n## 项目资产\n\n${assets}\n\n## 接入边界\n\n- 先保留页面中的加载、空、错误和成功反馈状态。\n- 用真实 API、状态管理和权限规则替换模拟数据。\n- 后端实现、密钥、鉴权与生产部署不属于此交付物。\n`;
}

const INITIAL_TOKENS = `:root {
  --color-canvas: #ffffff;
  --color-text: #171717;
  --font-sans: Inter, ui-sans-serif, system-ui, sans-serif;
  --space-md: 16px;
  --radius-md: 12px;
}
`;

export class ProjectRepository {
  private readonly index: ProjectIndexStore;

  constructor(indexFile: string) {
    this.index = new ProjectIndexStore(indexFile);
  }

  create(input: CreateProjectInput, initialTokensCss?: string): ProjectRecord {
    if (!input.name?.trim()) throw new ProjectRepositoryError("INVALID_INPUT", "project name is required");
    if (!isAbsolute(input.parentDirectory)) {
      throw new ProjectRepositoryError("INVALID_INPUT", "parentDirectory must be absolute");
    }
    const parent = resolve(input.parentDirectory);
    if (!existsSync(parent) || !statSync(parent).isDirectory()) {
      throw new ProjectRepositoryError("NOT_FOUND", "parent directory not found");
    }
    const canonicalParent = realpathSync(parent);
    const folder = projectFolderName(input.name, input.folderName);
    const target = join(canonicalParent, folder);
    if (existsSync(target)) throw new ProjectRepositoryError("ALREADY_EXISTS", `project directory already exists: ${folder}`);

    const id = randomUUID();
    let manifest: ProjectManifest;
    try {
      manifest = createProjectManifest(input, id);
    } catch (error) {
      throw new ProjectRepositoryError("INVALID_INPUT", "invalid project configuration", { cause: error });
    }
    const staging = join(canonicalParent, `.${folder}.vibedesign-${randomUUID()}.tmp`);
    if (!isInside(canonicalParent, staging) || !isInside(canonicalParent, target)) {
      throw new ProjectRepositoryError("UNSAFE_PATH", "project path escapes parent directory");
    }

    try {
      mkdirSync(join(staging, "pages"), { recursive: true });
      mkdirSync(join(staging, "components"), { recursive: true });
      mkdirSync(join(staging, "assets"), { recursive: true });
      mkdirSync(join(staging, ".vibedesign", "versions"), { recursive: true });
      for (const [index, page] of manifest.pages.entries()) {
        const file = resolve(staging, ...page.path.split("/"));
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, index === 0 ? initialPage(manifest.name) : placeholderPage(page.title));
      }
      writeFileSync(join(staging, "tokens.css"), initialTokensCss?.trim() || INITIAL_TOKENS);
      writeJsonAtomic(join(staging, ".vibedesign", "comments.json"), []);
      writeJsonAtomic(join(staging, ".vibedesign", "state.json"), { activePageId: manifest.entryPageId });
      writeJsonAtomic(join(staging, "vibedesign.json"), manifest);
      renameSync(staging, target);
    } catch (error) {
      if (existsSync(staging) && isInside(canonicalParent, resolve(staging))) rmSync(staging, { recursive: true, force: true });
      throw error;
    }

    const directory = realpathSync(target);
    this.index.upsert(indexEntry(directory, manifest));
    refreshExternalBaseline(directory);
    return { directory, manifest };
  }

  importProject(input: ImportProjectInput): ProjectRecord {
    if (!isAbsolute(input.parentDirectory)) {
      throw new ProjectRepositoryError("INVALID_INPUT", "parentDirectory must be absolute");
    }
    const parent = resolve(input.parentDirectory);
    if (!existsSync(parent) || !statSync(parent).isDirectory()) {
      throw new ProjectRepositoryError("NOT_FOUND", "parent directory not found");
    }

    let manifest: ProjectManifest;
    try {
      manifest = parseProjectManifest(input.manifest);
    } catch (error) {
      throw new ProjectRepositoryError("INVALID_INPUT", "invalid imported project manifest", { cause: error });
    }
    const files = Object.entries(input.files);
    for (const [path] of files) {
      const normalized = path.replace(/\\/g, "/");
      if (
        !isSafeProjectRelativePath(normalized) ||
        normalized === "vibedesign.json" ||
        normalized.startsWith(".vibedesign/")
      ) {
        throw new ProjectRepositoryError("UNSAFE_PATH", `unsafe imported project file path: ${path}`);
      }
    }
    const filePaths = new Set(files.map(([path]) => path.replace(/\\/g, "/")));
    for (const page of manifest.pages) {
      if (!filePaths.has(page.path)) {
        throw new ProjectRepositoryError("INVALID_INPUT", `import is missing page file: ${page.path}`);
      }
    }
    if (!filePaths.has(manifest.designLanguage.tokens)) {
      throw new ProjectRepositoryError(
        "INVALID_INPUT",
        `import is missing design tokens file: ${manifest.designLanguage.tokens}`,
      );
    }

    const canonicalParent = realpathSync(parent);
    const folder = projectFolderName(manifest.name, input.folderName);
    const target = join(canonicalParent, folder);
    if (existsSync(target)) throw new ProjectRepositoryError("ALREADY_EXISTS", `project directory already exists: ${folder}`);
    const staging = join(canonicalParent, `.${folder}.vibedesign-${randomUUID()}.tmp`);
    if (!isInside(canonicalParent, staging) || !isInside(canonicalParent, target)) {
      throw new ProjectRepositoryError("UNSAFE_PATH", "project path escapes parent directory");
    }

    try {
      mkdirSync(staging, { recursive: true });
      for (const [path, content] of files) {
        const normalized = path.replace(/\\/g, "/");
        const targetFile = resolve(staging, ...normalized.split("/"));
        if (!isInside(staging, targetFile)) {
          throw new ProjectRepositoryError("UNSAFE_PATH", `imported file escapes staging directory: ${path}`);
        }
        mkdirSync(dirname(targetFile), { recursive: true });
        writeFileSync(targetFile, content);
      }
      mkdirSync(join(staging, "components"), { recursive: true });
      mkdirSync(join(staging, "assets"), { recursive: true });
      mkdirSync(join(staging, ".vibedesign", "versions"), { recursive: true });
      writeJsonAtomic(join(staging, ".vibedesign", "comments.json"), input.comments ?? []);
      writeJsonAtomic(join(staging, ".vibedesign", "state.json"), { activePageId: manifest.entryPageId });
      if (input.legacySnapshot !== undefined) {
        const legacyDirectory = join(staging, ".vibedesign", "versions", "legacy");
        mkdirSync(legacyDirectory, { recursive: true });
        writeJsonAtomic(join(legacyDirectory, "project.json"), input.legacySnapshot);
      }
      writeJsonAtomic(join(staging, "vibedesign.json"), manifest);
      renameSync(staging, target);
    } catch (error) {
      if (existsSync(staging) && isInside(canonicalParent, resolve(staging))) {
        rmSync(staging, { recursive: true, force: true });
      }
      throw error;
    }

    const directory = realpathSync(target);
    this.index.upsert(indexEntry(directory, manifest, input.favorite));
    refreshExternalBaseline(directory);
    return { directory, manifest };
  }

  open(directory: string): ProjectRecord {
    if (!isAbsolute(directory)) throw new ProjectRepositoryError("INVALID_INPUT", "project directory must be absolute");
    const resolved = resolve(directory);
    if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
      throw new ProjectRepositoryError("NOT_FOUND", "project directory not found");
    }
    const canonical = realpathSync(resolved);
    const manifest = readManifest(canonical);
    const favorite = this.index.list().find((entry) => entry.id === manifest.id)?.favorite;
    this.index.upsert(indexEntry(canonical, manifest, favorite));
    return { directory: canonical, manifest };
  }

  list(): ProjectIndexEntry[] {
    return this.index
      .list()
      .map((entry) => {
        if (!existsSync(entry.directory)) return { ...entry, missing: true, invalid: undefined };
        try {
          const manifest = readManifest(realpathSync(entry.directory));
          return { ...indexEntry(realpathSync(entry.directory), manifest, entry.favorite), missing: undefined, invalid: undefined };
        } catch {
          return { ...entry, missing: undefined, invalid: true };
        }
      })
      .sort((a, b) => Number(b.favorite ?? false) - Number(a.favorite ?? false) || b.updatedAt - a.updatedAt);
  }

  get(id: string): ProjectRecord {
    const entry = this.index.list().find((item) => item.id === id);
    if (!entry) throw new ProjectRepositoryError("NOT_FOUND", "project is not indexed");
    return this.open(entry.directory);
  }

  addPage(id: string, input: CreateProjectPageInput): ProjectRecord {
    const title = input.title?.trim();
    if (!title) throw new ProjectRepositoryError("INVALID_INPUT", "page title is required");
    const record = this.get(id);
    const root = realpathSync(record.directory);
    const fileName = pageFileName(title, input.fileName);
    const path = `pages/${fileName}`;
    if (record.manifest.pages.some((page) => page.path.toLowerCase() === path.toLowerCase())) {
      throw new ProjectRepositoryError("ALREADY_EXISTS", `page file already exists: ${fileName}`);
    }
    const target = resolve(root, "pages", fileName);
    if (!isInside(root, target) || existsSync(target)) {
      throw new ProjectRepositoryError("ALREADY_EXISTS", `page file already exists: ${fileName}`);
    }
    const temp = `${target}.${randomUUID()}.tmp`;
    let placed = false;
    try {
      writeFileSync(temp, placeholderPage(title));
      renameSync(temp, target);
      placed = true;
      const pageId = `page-${randomUUID()}`;
      return this.saveManifest(root, {
        ...record.manifest,
        pages: [...record.manifest.pages, { id: pageId, path, title, status: "draft" }],
      });
    } catch (error) {
      if (existsSync(temp)) rmSync(temp, { force: true });
      if (placed && existsSync(target)) rmSync(target, { force: true });
      throw error;
    }
  }

  renamePage(id: string, pageId: string, input: RenameProjectPageInput): ProjectRecord {
    const title = input.title?.trim();
    if (!title) throw new ProjectRepositoryError("INVALID_INPUT", "page title is required");
    const record = this.get(id);
    if (!record.manifest.pages.some((page) => page.id === pageId)) {
      throw new ProjectRepositoryError("NOT_FOUND", "page not found");
    }
    return this.saveManifest(record.directory, {
      ...record.manifest,
      pages: record.manifest.pages.map((page) => (page.id === pageId ? { ...page, title } : page)),
    });
  }

  reorderPages(id: string, input: ReorderProjectPagesInput): ProjectRecord {
    const record = this.get(id);
    const currentIds = record.manifest.pages.map((page) => page.id);
    if (
      input.pageIds.length !== currentIds.length ||
      new Set(input.pageIds).size !== currentIds.length ||
      input.pageIds.some((pageId) => !currentIds.includes(pageId))
    ) {
      throw new ProjectRepositoryError("INVALID_INPUT", "pageIds must contain every page exactly once");
    }
    const pages = new Map(record.manifest.pages.map((page) => [page.id, page]));
    return this.saveManifest(record.directory, {
      ...record.manifest,
      pages: input.pageIds.map((pageId) => pages.get(pageId)!),
    });
  }

  removePage(id: string, pageId: string, cascade = false): ProjectRecord {
    const record = this.get(id);
    if (record.manifest.pages.length === 1) {
      throw new ProjectRepositoryError("INVALID_INPUT", "a project must keep at least one page");
    }
    const page = record.manifest.pages.find((item) => item.id === pageId);
    if (!page) throw new ProjectRepositoryError("NOT_FOUND", "page not found");
    const referenced = record.manifest.flows.some((flow) => flow.steps.some((step) => step.pageId === pageId));
    if (referenced && !cascade) {
      throw new ProjectRepositoryError("INVALID_INPUT", "page is referenced by an experience flow");
    }

    const pages = record.manifest.pages.filter((item) => item.id !== pageId);
    const updated = this.saveManifest(record.directory, {
      ...record.manifest,
      entryPageId: record.manifest.entryPageId === pageId ? pages[0].id : record.manifest.entryPageId,
      pages,
      flows: record.manifest.flows.map((flow) => ({
        ...flow,
        status: flow.steps.some((step) => step.pageId === pageId) ? "draft" : flow.status,
        steps: flow.steps.filter((step) => step.pageId !== pageId),
      })),
    });

    const source = resolve(record.directory, ...page.path.split("/"));
    if (existsSync(source) && lstatSync(source).isFile()) {
      const trashDirectory = join(record.directory, ".vibedesign", "trash");
      mkdirSync(trashDirectory, { recursive: true });
      renameSync(source, join(trashDirectory, `${Date.now()}-${basename(page.path)}`));
    }
    refreshExternalBaseline(updated.directory);
    return updated;
  }

  addFlow(id: string, input: CreateExperienceFlowInput): ProjectRecord {
    const name = input.name?.trim();
    if (!name) throw new ProjectRepositoryError("INVALID_INPUT", "flow name is required");
    if (!Array.isArray(input.pageIds) || input.pageIds.length === 0) {
      throw new ProjectRepositoryError("INVALID_INPUT", "flow requires at least one page");
    }
    const record = this.get(id);
    const pages = new Map(record.manifest.pages.map((page) => [page.id, page]));
    if (input.pageIds.some((pageId) => !pages.has(pageId))) {
      throw new ProjectRepositoryError("INVALID_INPUT", "flow references an unknown page");
    }
    const flowId = `flow-${randomUUID()}`;
    return this.saveManifest(record.directory, {
      ...record.manifest,
      flows: [
        ...record.manifest.flows,
        {
          id: flowId,
          name,
          status: "draft",
          steps: input.pageIds.map((pageId, index) => ({
            id: `step-${randomUUID()}`,
            pageId,
            action: index === 0 ? `打开“${pages.get(pageId)!.title}”` : `前往“${pages.get(pageId)!.title}”`,
            expected: `显示“${pages.get(pageId)!.title}”页面`,
            commands: [
              { type: "open" },
              { type: "expect-visible", target: { by: "role", value: "heading", name: pages.get(pageId)!.title } },
            ],
          })),
        },
      ],
    });
  }

  renameFlow(id: string, flowId: string, input: RenameExperienceFlowInput): ProjectRecord {
    const name = input.name?.trim();
    if (!name) throw new ProjectRepositoryError("INVALID_INPUT", "flow name is required");
    const record = this.get(id);
    if (!record.manifest.flows.some((flow) => flow.id === flowId)) {
      throw new ProjectRepositoryError("NOT_FOUND", "experience flow not found");
    }
    return this.saveManifest(record.directory, {
      ...record.manifest,
      flows: record.manifest.flows.map((flow) => (flow.id === flowId ? { ...flow, name } : flow)),
    });
  }

  removeFlow(id: string, flowId: string): ProjectRecord {
    const record = this.get(id);
    if (!record.manifest.flows.some((flow) => flow.id === flowId)) {
      throw new ProjectRepositoryError("NOT_FOUND", "experience flow not found");
    }
    return this.saveManifest(record.directory, {
      ...record.manifest,
      flows: record.manifest.flows.filter((flow) => flow.id !== flowId),
    });
  }

  validateExperienceFlow(
    id: string,
    flowId: string,
    runCompleted: boolean,
    runtime: ProjectFlowRuntimeReport = {
      runtimeErrors: [],
      brokenLinks: [],
      externalRequests: [],
      horizontalOverflow: [],
      stepFailures: [],
      accessibilityIssues: [],
      inoperableControls: [],
    },
  ): { record: ProjectRecord; validation: ProjectFlowValidation } {
    const record = this.get(id);
    const flow = record.manifest.flows.find((item) => item.id === flowId);
    if (!flow) throw new ProjectRepositoryError("NOT_FOUND", "experience flow not found");
    const pageFailures: string[] = [];
    const hash = createHash("sha256");
    hash.update(JSON.stringify(flow.steps));
    let tokensReady = true;
    try {
      hash.update(this.readPreviewFile(id, record.manifest.designLanguage.tokens).body);
    } catch {
      tokensReady = false;
    }
    for (const step of flow.steps) {
      const page = record.manifest.pages.find((item) => item.id === step.pageId);
      if (!page) {
        pageFailures.push(`unknown:${step.pageId}`);
        continue;
      }
      try {
        hash.update(page.path);
        hash.update(this.readPreviewFile(id, page.path).body);
      } catch {
        pageFailures.push(page.path);
      }
    }
    const missingAssets = record.manifest.assets.filter((asset) => asset.status === "missing").map((asset) => asset.path);
    const passed =
      runCompleted &&
      tokensReady &&
      pageFailures.length === 0 &&
      missingAssets.length === 0 &&
      runtime.runtimeErrors.length === 0 &&
      runtime.brokenLinks.length === 0 &&
      runtime.externalRequests.length === 0 &&
      runtime.horizontalOverflow.length === 0 &&
      runtime.stepFailures.length === 0 &&
      runtime.accessibilityIssues.length === 0 &&
      runtime.inoperableControls.length === 0;
    let updated = record;
    if (passed || flow.status !== "draft") {
      updated = this.saveManifest(record.directory, {
        ...record.manifest,
        flows: record.manifest.flows.map((item) =>
          item.id === flowId ? { ...item, status: passed ? "ready-for-review" : "draft" } : item,
        ),
      });
    }
    const validation: ProjectFlowValidation = {
      flowId,
      validatedAt: Date.now(),
      manifestUpdatedAt: updated.manifest.updatedAt,
      contentHash: hash.digest("hex"),
      runCompleted,
      passed,
      checks: { pages: pageFailures, tokens: tokensReady, missingAssets, ...runtime },
    };
    const validationFile = join(updated.directory, ".vibedesign", "validations", `${flowId}.json`);
    mkdirSync(dirname(validationFile), { recursive: true });
    writeJsonAtomic(validationFile, validation);
    return { record: updated, validation };
  }

  completeExperienceFlow(id: string, flowId: string, input: CompleteExperienceFlowInput): ProjectRecord {
    const record = this.get(id);
    const flow = record.manifest.flows.find((item) => item.id === flowId);
    if (!flow) throw new ProjectRepositoryError("NOT_FOUND", "experience flow not found");
    const validation = readJsonFile<ProjectFlowValidation | undefined>(
      join(record.directory, ".vibedesign", "validations", `${flowId}.json`),
      undefined,
    );
    if (!validation?.passed) {
      throw new ProjectRepositoryError("INVALID_INPUT", "flow requires a current successful run before review completion");
    }
    const expectedCriteria = PROJECT_FLOW_REVIEW_CRITERIA.map((criterion) => criterion.id);
    const acceptedCriteria = Array.isArray(input?.acceptedCriteria) ? input.acceptedCriteria : [];
    if (
      acceptedCriteria.length !== expectedCriteria.length ||
      new Set(acceptedCriteria).size !== acceptedCriteria.length ||
      expectedCriteria.some((criterion) => !acceptedCriteria.includes(criterion))
    ) {
      throw new ProjectRepositoryError("INVALID_INPUT", "flow review must accept every design criterion");
    }
    const note = input.note?.trim();
    if (note && note.length > 2000) throw new ProjectRepositoryError("INVALID_INPUT", "flow review note is too long");
    const currentHash = createHash("sha256");
    currentHash.update(JSON.stringify(flow.steps));
    currentHash.update(this.readPreviewFile(id, record.manifest.designLanguage.tokens).body);
    for (const step of flow.steps) {
      const page = record.manifest.pages.find((item) => item.id === step.pageId);
      if (!page) throw new ProjectRepositoryError("INVALID_PROJECT", "flow references an unknown page");
      currentHash.update(page.path);
      currentHash.update(this.readPreviewFile(id, page.path).body);
    }
    if (currentHash.digest("hex") !== validation.contentHash) {
      throw new ProjectRepositoryError("INVALID_INPUT", "flow files changed since the successful run");
    }
    const reviewFile = join(record.directory, ".vibedesign", "reviews", `${flowId}.json`);
    const previousReview = readJsonFile<ProjectFlowReview | undefined>(reviewFile, undefined);
    const review: ProjectFlowReview = {
      flowId,
      reviewedAt: Date.now(),
      validationContentHash: validation.contentHash,
      acceptedCriteria: [...expectedCriteria],
      ...(note ? { note } : {}),
    };
    mkdirSync(dirname(reviewFile), { recursive: true });
    writeJsonAtomic(reviewFile, review);
    try {
      return this.saveManifest(record.directory, {
        ...record.manifest,
        flows: record.manifest.flows.map((item) => (item.id === flowId ? { ...item, status: "completed" } : item)),
      });
    } catch (error) {
      if (previousReview) writeJsonAtomic(reviewFile, previousReview);
      else if (existsSync(reviewFile)) rmSync(reviewFile, { force: true });
      throw error;
    }
  }

  readExperienceFlowReview(id: string, flowId: string): ProjectFlowReview | undefined {
    const record = this.get(id);
    if (!record.manifest.flows.some((flow) => flow.id === flowId)) {
      throw new ProjectRepositoryError("NOT_FOUND", "experience flow not found");
    }
    return readJsonFile<ProjectFlowReview | undefined>(
      join(record.directory, ".vibedesign", "reviews", `${flowId}.json`),
      undefined,
    );
  }

  registerAsset(id: string, input: RegisterProjectAssetInput): ProjectRecord {
    const path = input.path?.replace(/\\/g, "/");
    if (!isSafeProjectRelativePath(path) || !path.startsWith("assets/")) {
      throw new ProjectRepositoryError("INVALID_INPUT", "project assets must use a safe path inside assets/");
    }
    const record = this.get(id);
    if (record.manifest.assets.some((asset) => asset.path === path)) {
      throw new ProjectRepositoryError("ALREADY_EXISTS", "project asset is already registered");
    }
    const exists = existsSync(resolve(record.directory, ...path.split("/")));
    return this.saveManifest(record.directory, {
      ...record.manifest,
      assets: [
        ...record.manifest.assets,
        {
          id: `asset-${randomUUID()}`,
          path,
          kind: input.kind,
          status: input.source.type === "remote" ? "placeholder" : exists ? "ready" : "missing",
          source: input.source,
        },
      ],
    });
  }

  auditAssets(id: string): ProjectRecord {
    const record = this.get(id);
    return this.saveManifest(record.directory, {
      ...record.manifest,
      assets: record.manifest.assets.map((asset) => {
        if (asset.source.type === "remote") return asset;
        const target = resolve(record.directory, ...asset.path.split("/"));
        const ready = isInside(record.directory, target) && existsSync(target) && lstatSync(target).isFile();
        return { ...asset, status: ready ? "ready" : "missing" };
      }),
    });
  }

  replaceProjectFiles(
    id: string,
    files: ProjectFileReplacement[],
    affectedPageIds: string[],
    options?: { deepenedFlowId?: string; flowSteps?: ProjectFlowAutomationUpdate[] },
  ): ProjectRecord {
    const record = this.get(id);
    const root = realpathSync(record.directory);
    const transaction = join(root, ".vibedesign", "transactions", randomUUID());
    const stagedRoot = join(transaction, "staged");
    const backupRoot = join(transaction, "backup");
    const operations: { target: string; backup: string; hadOriginal: boolean; applied: boolean }[] = [];
    if (!isInside(root, transaction)) throw new ProjectRepositoryError("UNSAFE_PATH", "transaction escapes project");

    const deepenedFlow = options?.deepenedFlowId
      ? record.manifest.flows.find((flow) => flow.id === options.deepenedFlowId)
      : undefined;
    if (options?.deepenedFlowId && !deepenedFlow) {
      throw new ProjectRepositoryError("NOT_FOUND", "deepened experience flow not found");
    }
    const deepenedPageIds = new Set(deepenedFlow?.steps.map((step) => step.pageId) ?? []);
    if (deepenedFlow) {
      const replacementPageIds = new Set(
        record.manifest.pages.filter((page) => files.some((file) => file.path === page.path)).map((page) => page.id),
      );
      if (
        replacementPageIds.size !== deepenedPageIds.size ||
        [...deepenedPageIds].some((pageId) => !replacementPageIds.has(pageId))
      ) {
        throw new ProjectRepositoryError("INVALID_INPUT", "flow deepening must replace every page in exactly one experience flow");
      }
      const automation = options?.flowSteps;
      if (!automation?.length) {
        throw new ProjectRepositoryError("INVALID_INPUT", "flow deepening must include executable commands for every step");
      }
      const stepIds = new Set(deepenedFlow.steps.map((step) => step.id));
      const returnedStepIds = new Set(automation.map((step) => step.stepId));
      if (
        returnedStepIds.size !== automation.length ||
        returnedStepIds.size !== stepIds.size ||
        [...stepIds].some((stepId) => !returnedStepIds.has(stepId)) ||
        automation.some((step) => !step.commands.length)
      ) {
        throw new ProjectRepositoryError("INVALID_INPUT", "flow deepening must define every executable step exactly once");
      }
    }

    try {
      for (const file of files) {
        const parts = file.path.replace(/\\/g, "/").split("/");
        const target = resolve(root, ...parts);
        if (!isInside(root, target)) throw new ProjectRepositoryError("UNSAFE_PATH", "replacement escapes project");
        assertNoSymlinkPath(root, target);
        if (existsSync(target)) {
          if (!lstatSync(target).isFile() || !isInside(root, realpathSync(target))) {
            throw new ProjectRepositoryError("UNSAFE_PATH", "replacement target is not a safe project file");
          }
        }
        const staged = resolve(stagedRoot, ...parts);
        const backup = resolve(backupRoot, ...parts);
        mkdirSync(dirname(staged), { recursive: true });
        writeFileSync(staged, file.content);
        operations.push({ target, backup, hadOriginal: existsSync(target), applied: false });
      }

      for (const operation of operations) {
        mkdirSync(dirname(operation.target), { recursive: true });
        if (operation.hadOriginal) {
          mkdirSync(dirname(operation.backup), { recursive: true });
          renameSync(operation.target, operation.backup);
        }
        const path = relative(root, operation.target).split(/[\\/]/);
        renameSync(resolve(stagedRoot, ...path), operation.target);
        operation.applied = true;
      }

      const affected = new Set(affectedPageIds);
      return this.saveManifest(root, {
        ...record.manifest,
        pages: record.manifest.pages.map((page) =>
          deepenedPageIds.has(page.id)
            ? { ...page, status: "deepened" }
            : affected.has(page.id)
              ? { ...page, status: "draft" }
              : page,
        ),
        flows: record.manifest.flows.map((flow) => {
          const affectedFlow = flow.steps.some((step) => affected.has(step.pageId));
          const commands = flow.id === deepenedFlow?.id
            ? new Map(options!.flowSteps!.map((step) => [step.stepId, step.commands]))
            : undefined;
          return affectedFlow
            ? {
                ...flow,
                status: "draft",
                steps: commands
                  ? flow.steps.map((step) => ({ ...step, commands: commands.get(step.id)! }))
                  : flow.steps,
              }
            : flow;
        }),
      });
    } catch (error) {
      for (const operation of [...operations].reverse()) {
        if (!operation.applied && !existsSync(operation.backup)) continue;
        if (existsSync(operation.target)) rmSync(operation.target, { force: true });
        if (operation.hadOriginal && existsSync(operation.backup)) {
          mkdirSync(dirname(operation.target), { recursive: true });
          renameSync(operation.backup, operation.target);
        }
      }
      throw error;
    } finally {
      if (existsSync(transaction) && isInside(root, resolve(transaction))) {
        rmSync(transaction, { recursive: true, force: true });
      }
    }
  }

  removeFromIndex(id: string): void {
    this.index.remove(id);
  }

  async exportProject(
    id: string,
    destinationDirectory: string,
    validate: (directory: string) => Promise<ProjectExportValidation>,
    folderName?: string,
    format: "folder" | "zip" = "folder",
  ): Promise<ProjectExport> {
    if (!isAbsolute(destinationDirectory)) {
      throw new ProjectRepositoryError("INVALID_INPUT", "destinationDirectory must be absolute");
    }
    const destination = resolve(destinationDirectory);
    if (!existsSync(destination) || !statSync(destination).isDirectory()) {
      throw new ProjectRepositoryError("NOT_FOUND", "export destination directory not found");
    }
    const parent = realpathSync(destination);
    const record = this.get(id);
    const folder = projectFolderName(record.manifest.name, folderName);
    const target = join(parent, format === "zip" ? `${folder}.zip` : folder);
    const staging = join(parent, `.${folder}.vibedesign-export-${randomUUID()}.tmp`);
    const archiveStaging = join(parent, `.${folder}.vibedesign-export-${randomUUID()}.zip.tmp`);
    if (!isInside(parent, target) || !isInside(parent, staging) || !isInside(parent, archiveStaging)) {
      throw new ProjectRepositoryError("UNSAFE_PATH", "export path escapes destination");
    }
    if (existsSync(target)) throw new ProjectRepositoryError("ALREADY_EXISTS", `export target already exists: ${basename(target)}`);

    try {
      mkdirSync(staging, { recursive: true });
      const files = copyPublicProject(record.directory, staging);
      const validation = await validate(staging);
      if (validation.status === "failed") {
        throw new ProjectRepositoryError("INVALID_PROJECT", "exported project failed independent flow validation");
      }
      const handoffFile = "VIBEDESIGN_HANDOFF.md";
      const handoffDataFile = "VIBEDESIGN_HANDOFF.json";
      const bundle: ProjectHandoffBundle = {
        schema: "vibedesign.handoff",
        schemaVersion: 1,
        exportedAt: Date.now(),
        manifest: record.manifest,
        designLanguage: {
          tokensPath: record.manifest.designLanguage.tokens,
          tokensCss: readFileSync(join(record.directory, ...record.manifest.designLanguage.tokens.split("/")), "utf8"),
          componentsDir: record.manifest.designLanguage.componentsDir,
        },
        assets: record.manifest.assets,
        flows: record.manifest.flows.map((flow) => ({
          id: flow.id,
          name: flow.name,
          status: flow.status,
          steps: flow.steps,
          ...(() => {
            const validation = readJsonFile<ProjectFlowValidation | undefined>(
              join(record.directory, ".vibedesign", "validations", `${flow.id}.json`),
              undefined,
            );
            const review = readJsonFile<ProjectFlowReview | undefined>(
              join(record.directory, ".vibedesign", "reviews", `${flow.id}.json`),
              undefined,
            );
            return { ...(validation ? { validation } : {}), ...(review ? { review } : {}) };
          })(),
        })),
        exportValidation: validation,
      };
      writeJsonAtomic(join(staging, handoffDataFile), bundle);
      writeFileSync(join(staging, handoffFile), handoffNotes(bundle), "utf8");
      const result = {
        path: target,
        handoffFile,
        handoffDataFile,
        files: [...files, handoffFile, handoffDataFile].sort(),
        validation,
      };
      if (format === "zip") {
        await archiveProjectDirectory(staging, archiveStaging, folder);
        renameSync(archiveStaging, target);
        rmSync(staging, { recursive: true, force: true });
        return { ...result, format, archiveFile: target };
      }
      renameSync(staging, target);
      return { ...result, format, directory: target };
    } catch (error) {
      if (existsSync(staging) && isInside(parent, resolve(staging))) rmSync(staging, { recursive: true, force: true });
      if (existsSync(archiveStaging) && isInside(parent, resolve(archiveStaging))) rmSync(archiveStaging, { force: true });
      throw error;
    }
  }

  readPreviewFile(id: string, requestedPath: string): ServedProjectFile {
    let normalized: string;
    try {
      normalized = decodeURIComponent(requestedPath).replace(/\\/g, "/").replace(/^\/+/, "");
    } catch (error) {
      throw new ProjectRepositoryError("INVALID_INPUT", "invalid encoded project file path", { cause: error });
    }
    if (!isSafeProjectRelativePath(normalized)) throw new ProjectRepositoryError("UNSAFE_PATH", "unsafe project file path");
    const segments = normalized.split("/");
    if (segments.some((segment) => segment.startsWith(".")) || basename(normalized) === "vibedesign.json") {
      throw new ProjectRepositoryError("UNSAFE_PATH", "project metadata is not previewable");
    }

    const record = this.get(id);
    const root = realpathSync(record.directory);
    const candidate = resolve(root, ...segments);
    if (!isInside(root, candidate) || !existsSync(candidate) || !lstatSync(candidate).isFile()) {
      throw new ProjectRepositoryError("NOT_FOUND", "project file not found");
    }
    const canonical = realpathSync(candidate);
    if (!isInside(root, canonical)) throw new ProjectRepositoryError("UNSAFE_PATH", "project file escapes project directory");
    return { body: readFileSync(canonical), contentType: contentTypeFor(canonical) };
  }

  private saveManifest(directory: string, candidate: ProjectManifest): ProjectRecord {
    let manifest: ProjectManifest;
    try {
      manifest = parseProjectManifest({ ...candidate, updatedAt: Date.now() });
    } catch (error) {
      throw new ProjectRepositoryError("INVALID_INPUT", "invalid project manifest update", { cause: error });
    }
    writeJsonAtomic(join(directory, "vibedesign.json"), manifest);
    const favorite = this.index.list().find((entry) => entry.id === manifest.id)?.favorite;
    this.index.upsert(indexEntry(directory, manifest, favorite));
    refreshExternalBaseline(directory);
    return { directory, manifest };
  }
}
