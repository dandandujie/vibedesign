import type { Express, Response } from "express";
import { join } from "node:path";
import type {
  CompleteExperienceFlowInput,
  CreateExperienceFlowInput,
  CreateProjectInput,
  CreateProjectPageInput,
  ProjectFlowAutomationUpdate,
  RenameExperienceFlowInput,
  RenameProjectPageInput,
  RegisterProjectAssetInput,
  ReorderProjectPagesInput,
  PreviewFeedbackInput,
} from "../../shared/project.js";
import { dataDir, moduleDir } from "./paths.js";
import {
  migrateLegacyProjects,
  ProjectMigrationError,
  readLegacyMigrationReport,
} from "./projectMigration.js";
import {
  commitProjectChange,
  planProjectChange,
  ProjectChangeConflictError,
  type ProjectFileReplacement,
} from "./projectChanges.js";
import { ProjectRepository, ProjectRepositoryError } from "./projectRepository.js";
import type { ProviderConfig } from "./providers/index.js";
import { runCompletion } from "./agentApi.js";
import {
  assembleProjectDesignContext,
  assembleProjectGenerationContext,
  assertProjectGenerationFiles,
  parseProjectFileReplacements,
  parseProjectGenerationResult,
  type ProjectGenerationScope,
} from "./projectContext.js";
import { getDesignSystem } from "./storage.js";
import {
  createProjectVariant,
  detectExternalProjectChanges,
  acceptProjectVariant,
  listProjectVariants,
  listProjectVersions,
  restoreProjectVersion,
  snapshotProject,
} from "./projectVersions.js";
import { ProjectWatchRegistry } from "./projectWatch.js";
import { validateProjectFlowRuntime } from "./projectFlowRuntime.js";
import { completedFlowsAffectedByFiles, rerunCompletedFlows } from "./projectRegression.js";
import { validateExportedProject } from "./projectExportValidation.js";
import { exportPreviewFeedback, previewSafetyStatus } from "./previewSafety.js";

const PROJECT_DATA_DIR = dataDir(join(moduleDir, "..", ".data"));
const repository = new ProjectRepository(join(PROJECT_DATA_DIR, "project-index.json"));
const projectWatchers = new ProjectWatchRegistry();

function watchProject(projectId: string): void {
  const record = repository.get(projectId);
  projectWatchers.watch(projectId, record.directory);
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof ProjectChangeConflictError) {
    res.status(409).json({ error: error.message, code: "PROJECT_FILE_CONFLICT", conflicts: error.conflicts });
    return;
  }
  if (error instanceof ProjectMigrationError) {
    const status = error.code === "NOT_FOUND" ? 404 : error.code === "INVALID_SOURCE" ? 422 : 409;
    res.status(status).json({ error: error.message, code: error.code, ...(error.report ? { report: error.report } : {}) });
    return;
  }
  if (error instanceof ProjectRepositoryError) {
    const status =
      error.code === "NOT_FOUND"
        ? 404
        : error.code === "ALREADY_EXISTS"
          ? 409
          : error.code === "INVALID_PROJECT"
            ? 422
            : 400;
    res.status(status).json({ error: error.message, code: error.code });
    return;
  }
  res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
}

export interface ProjectV2ApiDeps {
  resolveProvider: (providerId?: string) => ProviderConfig | undefined;
  appVersion: () => string;
}

export function mountProjectV2Api(app: Express, deps: ProjectV2ApiDeps): void {
  const migrationStateFile = join(PROJECT_DATA_DIR, "migrations", "legacy-projects-v1.json");

  app.get("/api/v2/preview/safety", (_req, res) => {
    try {
      res.json(previewSafetyStatus(repository, migrationStateFile, deps.appVersion()));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/v2/preview/feedback", (req, res) => {
    try {
      res.status(201).json(exportPreviewFeedback(
        repository,
        migrationStateFile,
        deps.appVersion(),
        String(req.body?.destinationDirectory ?? ""),
        req.body?.feedback as PreviewFeedbackInput,
      ));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/v2/migrations/legacy", (_req, res) => {
    try {
      res.json(readLegacyMigrationReport(migrationStateFile) ?? null);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/v2/migrations/legacy", (req, res) => {
    try {
      res.json(
        migrateLegacyProjects({
          legacyFile: join(PROJECT_DATA_DIR, "projects.json"),
          targetParentDirectory: String(req.body?.targetParentDirectory ?? ""),
          stateFile: migrationStateFile,
          backupDirectory: join(PROJECT_DATA_DIR, "backups"),
          repository,
        }),
      );
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/v2/projects", (_req, res) => {
    try {
      res.json(repository.list());
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/v2/projects", (req, res) => {
    try {
      const input = req.body as CreateProjectInput;
      const designSystem = input.settings?.designSystemId ? getDesignSystem(input.settings.designSystemId) : undefined;
      const record = repository.create(input, designSystem?.tokensCss);
      projectWatchers.watch(record.manifest.id, record.directory);
      res.status(201).json(record);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/v2/projects/open", (req, res) => {
    try {
      const record = repository.open(String(req.body?.directory ?? ""));
      projectWatchers.watch(record.manifest.id, record.directory);
      res.json(record);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/v2/projects/:id", (req, res) => {
    try {
      watchProject(req.params.id);
      res.json(repository.get(req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete("/api/v2/projects/:id", (req, res) => {
    repository.removeFromIndex(req.params.id);
    res.json({ ok: true });
  });

  app.post("/api/v2/projects/:id/pages", (req, res) => {
    try {
      res.status(201).json(repository.addPage(req.params.id, req.body as CreateProjectPageInput));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch("/api/v2/projects/:id/pages/:pageId", (req, res) => {
    try {
      res.json(repository.renamePage(req.params.id, req.params.pageId, req.body as RenameProjectPageInput));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.put("/api/v2/projects/:id/pages/order", (req, res) => {
    try {
      res.json(repository.reorderPages(req.params.id, req.body as ReorderProjectPagesInput));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete("/api/v2/projects/:id/pages/:pageId", (req, res) => {
    try {
      res.json(repository.removePage(req.params.id, req.params.pageId, req.query.cascade === "true"));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/v2/projects/:id/flows", (req, res) => {
    try {
      res.status(201).json(repository.addFlow(req.params.id, req.body as CreateExperienceFlowInput));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch("/api/v2/projects/:id/flows/:flowId", (req, res) => {
    try {
      res.json(repository.renameFlow(req.params.id, req.params.flowId, req.body as RenameExperienceFlowInput));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete("/api/v2/projects/:id/flows/:flowId", (req, res) => {
    try {
      res.json(repository.removeFlow(req.params.id, req.params.flowId));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/v2/projects/:id/flows/:flowId/validate", async (req, res) => {
    try {
      const runtime = await validateProjectFlowRuntime(repository, req.params.id, req.params.flowId);
      res.json(repository.validateExperienceFlow(req.params.id, req.params.flowId, req.body?.runCompleted === true, runtime));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/v2/projects/:id/flows/:flowId/complete", (req, res) => {
    try {
      res.json(repository.completeExperienceFlow(
        req.params.id,
        req.params.flowId,
        req.body as CompleteExperienceFlowInput,
      ));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/v2/projects/:id/flows/:flowId/review", (req, res) => {
    try {
      res.json(repository.readExperienceFlowReview(req.params.id, req.params.flowId) ?? null);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/v2/projects/:id/assets", (req, res) => {
    try {
      res.status(201).json(repository.registerAsset(req.params.id, req.body as RegisterProjectAssetInput));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/v2/projects/:id/assets/audit", (req, res) => {
    try {
      res.json(repository.auditAssets(req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/v2/projects/:id/export", async (req, res) => {
    try {
      const format = req.body?.format === undefined ? "folder" : req.body.format;
      if (format !== "folder" && format !== "zip") {
        throw new ProjectRepositoryError("INVALID_INPUT", "format must be folder or zip");
      }
      res.status(201).json(await repository.exportProject(
        req.params.id,
        String(req.body?.destinationDirectory ?? ""),
        validateExportedProject,
        typeof req.body?.folderName === "string" ? req.body.folderName : undefined,
        format,
      ));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/v2/projects/:id/changes/plan", (req, res) => {
    try {
      res.json(planProjectChange(repository, req.params.id, req.body?.files as ProjectFileReplacement[]));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/v2/projects/:id/changes/commit", async (req, res) => {
    try {
      const files = req.body?.files as ProjectFileReplacement[];
      const completedFlowIds = completedFlowsAffectedByFiles(
        repository.get(req.params.id).manifest,
        Array.isArray(files) ? files.map((file) => String(file?.path ?? "")) : [],
      );
      const committed = commitProjectChange(
        repository,
        req.params.id,
        files,
        typeof req.body?.confirmedImpactHash === "string" ? req.body.confirmedImpactHash : undefined,
        typeof req.body?.deepenedFlowId === "string"
          ? {
              deepenedFlowId: req.body.deepenedFlowId,
              flowSteps: req.body?.flowSteps as ProjectFlowAutomationUpdate[] | undefined,
            }
          : undefined,
        () => snapshotProject(repository, req.params.id, {
          label: "AI 变更前检查点",
          source: "ai",
        }),
      );
      const rerun = await rerunCompletedFlows(repository, req.params.id, completedFlowIds);
      res.json({ ...committed, record: rerun.record, regression: rerun.regression });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/v2/projects/:id/versions", (req, res) => {
    try { res.json(listProjectVersions(repository, req.params.id)); } catch (error) { sendError(res, error); }
  });

  app.post("/api/v2/projects/:id/versions", (req, res) => {
    try {
      res.status(201).json(snapshotProject(repository, req.params.id, {
        label: String(req.body?.label ?? "手动保存"),
        source: "manual",
      }));
    } catch (error) { sendError(res, error); }
  });

  app.post("/api/v2/projects/:id/versions/:versionId/restore", (req, res) => {
    try { res.json(restoreProjectVersion(repository, req.params.id, req.params.versionId)); } catch (error) { sendError(res, error); }
  });

  app.post("/api/v2/projects/:id/variants", (req, res) => {
    try { res.status(201).json(createProjectVariant(repository, req.params.id, String(req.body?.label ?? "设计变体"))); } catch (error) { sendError(res, error); }
  });

  app.get("/api/v2/projects/:id/variants", (req, res) => {
    try { res.json(listProjectVariants(repository, req.params.id)); } catch (error) { sendError(res, error); }
  });

  app.post("/api/v2/projects/:id/variants/:variantId/accept", (req, res) => {
    try { res.json(acceptProjectVariant(repository, req.params.id, req.params.variantId)); } catch (error) { sendError(res, error); }
  });

  app.post("/api/v2/projects/:id/external-changes/check", async (req, res) => {
    try {
      watchProject(req.params.id);
      const result = detectExternalProjectChanges(repository, req.params.id);
      const completedFlowIds = completedFlowsAffectedByFiles(repository.get(req.params.id).manifest, result.changedFiles);
      const rerun = await rerunCompletedFlows(repository, req.params.id, completedFlowIds);
      projectWatchers.clear(req.params.id);
      res.json({ ...result, record: rerun.record, regression: rerun.regression });
    } catch (error) { sendError(res, error); }
  });

  app.get("/api/v2/projects/:id/external-changes/status", (req, res) => {
    try {
      watchProject(req.params.id);
      res.json({ dirty: projectWatchers.isDirty(req.params.id) });
    } catch (error) { sendError(res, error); }
  });

  app.post("/api/v2/projects/:id/generate-scope", async (req, res) => {
    const mode = req.body?.mode;
    const flowId = typeof req.body?.flowId === "string" ? req.body.flowId : "";
    if (mode !== "global-draft" && mode !== "flow-deepening") {
      return res.status(400).json({ error: "mode must be global-draft or flow-deepening" });
    }
    if (mode === "flow-deepening" && !flowId) return res.status(400).json({ error: "flowId is required" });
    try {
      const record = repository.get(req.params.id);
      const provider = deps.resolveProvider(
        typeof req.body?.providerId === "string" ? req.body.providerId : record.manifest.settings?.defaultProviderId,
      );
      if (!provider) return res.status(400).json({ error: "尚未配置可用的项目默认模型" });
      const scope: ProjectGenerationScope = mode === "global-draft"
        ? { mode }
        : { mode, flowId };
      const generated = assembleProjectGenerationContext(repository, req.params.id, scope);
      const supplement = typeof req.body?.prompt === "string" && req.body.prompt.trim()
        ? `\n\n# 用户补充要求\n\n${req.body.prompt.trim()}`
        : "";
      const controller = new AbortController();
      res.on("close", () => {
        if (!res.writableEnded) controller.abort();
      });
      const flowInstruction = mode === "flow-deepening"
        ? `\n- 同一 JSON 还必须包含 flowSteps，为目标流程的每个 stepId 完整返回一次可执行命令。\n- flowSteps 格式：[{"stepId":"步骤 ID","commands":[{"type":"open"},{"type":"click","target":{"by":"role","value":"button","name":"按钮名"}},{"type":"fill","target":{"by":"label","value":"字段标签"},"value":"输入值"},{"type":"expect-visible","target":{"by":"text","value":"可见文本"}},{"type":"expect-text","target":{"by":"vd-id","value":"稳定标识"},"value":"预期文本"},{"type":"expect-field-error","target":{"by":"label","value":"字段标签"},"value":"错误信息"},{"type":"expect-status","value":"进行中或成功反馈"},{"type":"expect-url","value":"pages/目标页面.html"}]}]。\n- 命令只允许 open、click、fill、expect-visible、expect-text、expect-field-error、expect-status、expect-url；定位优先 role、label、text，只有语义定位不足时才在 HTML 中添加 data-vd-id 并使用 vd-id。\n- 表单错误必须使用 aria-invalid 和 aria-describedby 与字段关联；异步和成功反馈必须使用 role=status、role=alert 或 aria-live，并用对应命令验证。`
        : "";
      const { text, error } = await runCompletion({
        messages: [{ role: "user", content: `${generated.context}${supplement}` }],
        provider,
        skillId: typeof req.body?.skillId === "string" ? req.body.skillId : undefined,
        designSystemId: record.manifest.settings?.designSystemId,
        signal: controller.signal,
        extraInstruction: `你正在执行 Project V2 的“${generated.label}”。
只返回一个 JSON 代码块，结构必须为：
{"files":[{"path":"页面路径","content":"完整文件内容"}]${mode === "flow-deepening" ? ",\"flowSteps\":[{\"stepId\":\"步骤 ID\",\"commands\":[{\"type\":\"open\"}]}]" : ""}}

规则：
- 必须完整返回这些页面，不能遗漏：${generated.pagePaths.join("、")}。
- 只有需要统一视觉规则时才额外返回 ${generated.tokensPath}；不要返回未改变的其他文件。
- 所有页面使用浏览器标准 HTML/CSS/JS，能够由静态服务器直接运行，并使用正确的相对链接串联目标流程。
- 必须呈现真实 UI/UX 状态与反馈；数据、权限和业务结果使用可替换模拟状态，不实现后端逻辑。
- 保持项目设计语言一致，避免为一次性布局创建共享抽象。
- 不得返回 vibedesign.json、.vibedesign 元数据、目录外路径或自由格式 diff。
- 可执行步骤只描述浏览器内可观察的前端操作与结果，不验证后端或内部实现。${flowInstruction}
- 不要解释，不要 Markdown 正文，只交付 JSON 事务。`,
      });
      if (controller.signal.aborted) return;
      if (error) return res.status(502).json({ error });
      const parsed = parseProjectGenerationResult(text);
      const files = parsed.files;
      assertProjectGenerationFiles(generated, files);
      if (mode === "flow-deepening") {
        const expected = record.manifest.flows.find((item) => item.id === flowId)!.steps.map((step) => step.id);
        const returned = parsed.flowSteps?.map((step) => step.stepId) ?? [];
        if (
          returned.length !== expected.length ||
          new Set(returned).size !== returned.length ||
          expected.some((stepId) => !returned.includes(stepId))
        ) {
          throw new ProjectRepositoryError("INVALID_PROJECT", "模型必须为目标流程的每个步骤返回可执行命令");
        }
      }
      const impact = planProjectChange(repository, req.params.id, files);
      res.json({ files, impact: { ...impact, requiresConfirmation: true }, scope: generated.label, ...(parsed.flowSteps ? { flowSteps: parsed.flowSteps } : {}) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/v2/projects/:id/generate-change", async (req, res) => {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    const pageId = typeof req.body?.pageId === "string" ? req.body.pageId : "";
    if (!prompt || !pageId) return res.status(400).json({ error: "prompt and pageId are required" });
    try {
      const record = repository.get(req.params.id);
      const provider = deps.resolveProvider(
        typeof req.body?.providerId === "string" ? req.body.providerId : record.manifest.settings?.defaultProviderId,
      );
      if (!provider) return res.status(400).json({ error: "尚未配置可用的项目默认模型" });
      const page = record.manifest.pages.find((item) => item.id === pageId);
      if (!page) throw new ProjectRepositoryError("NOT_FOUND", "target page not found");
      const context = assembleProjectDesignContext(repository, req.params.id, pageId);
      const controller = new AbortController();
      res.on("close", () => {
        if (!res.writableEnded) controller.abort();
      });
      const { text, error } = await runCompletion({
        messages: [{ role: "user", content: `${context}\n\n# 本次设计请求\n\n${prompt}` }],
        provider,
        skillId: typeof req.body?.skillId === "string" ? req.body.skillId : undefined,
        designSystemId: record.manifest.settings?.designSystemId,
        signal: controller.signal,
        extraInstruction: `你正在执行 Project V2 的影响感知修改。
只返回一个 JSON 代码块，结构必须为：
{"files":[{"path":"${page.path}","content":"完整文件内容"}]}

规则：
- 默认只完整替换当前页面 ${page.path}，不要返回未改变的文件。
- 仅当用户明确要求共享视觉规则时，才可同时替换 ${record.manifest.designLanguage.tokens}。
- 不得返回 vibedesign.json、.vibedesign 元数据、目录外路径或自由格式 diff。
- 保留可运行的浏览器标准 HTML/CSS/JS，不实现后端逻辑；需要的数据和结果使用可替换模拟状态。
- 不要解释，不要 Markdown 正文，只交付 JSON 事务。`,
      });
      if (controller.signal.aborted) return;
      if (error) return res.status(502).json({ error });
      const files = parseProjectFileReplacements(text);
      const impact = planProjectChange(repository, req.params.id, files);
      res.json({ files, impact });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/v2/projects/:id/files/*", (req, res) => {
    try {
      const file = repository.readPreviewFile(req.params.id, (req.params as Record<string, string>)[0] ?? "");
      res.setHeader("Content-Type", file.contentType);
      res.setHeader("Cache-Control", "no-store");
      res.send(file.body);
    } catch (error) {
      sendError(res, error);
    }
  });
}
