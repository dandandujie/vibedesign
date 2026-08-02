import type { ProjectFlowAutomationUpdate } from "../../shared/project.js";
import { projectFlowCommandSchema } from "./projectManifest.js";
import { ProjectRepository, ProjectRepositoryError } from "./projectRepository.js";

export type ProjectGenerationScope =
  | { mode: "global-draft" }
  | { mode: "flow-deepening"; flowId: string };

export interface ProjectGenerationContext {
  context: string;
  pagePaths: string[];
  tokensPath: string;
  label: string;
}

export function assembleProjectGenerationContext(
  repository: ProjectRepository,
  projectId: string,
  scope: ProjectGenerationScope,
): ProjectGenerationContext {
  const record = repository.get(projectId);
  const flow = scope.mode === "flow-deepening"
    ? record.manifest.flows.find((item) => item.id === scope.flowId)
    : undefined;
  if (scope.mode === "flow-deepening" && !flow) {
    throw new ProjectRepositoryError("NOT_FOUND", "target experience flow not found");
  }
  const pageIds = scope.mode === "global-draft"
    ? new Set(record.manifest.pages.map((page) => page.id))
    : new Set(flow!.steps.map((step) => step.pageId));
  const pages = record.manifest.pages.filter((page) => pageIds.has(page.id));
  if (!pages.length) throw new ProjectRepositoryError("INVALID_PROJECT", "generation scope has no pages");
  const tokens = repository.readPreviewFile(projectId, record.manifest.designLanguage.tokens).body.toString("utf8");
  const pageFiles = pages.map((page) => ({
    page,
    html: repository.readPreviewFile(projectId, page.path).body.toString("utf8"),
  }));
  const flows = scope.mode === "global-draft" ? record.manifest.flows : [flow!];
  const label = scope.mode === "global-draft" ? "全局草拟" : `流程深化：${flow!.name}`;

  return {
    pagePaths: pages.map((page) => page.path),
    tokensPath: record.manifest.designLanguage.tokens,
    label,
    context: `# 设计项目\n\n项目：${record.manifest.name}\n平台：${record.manifest.platform}\n执行策略：${label}\n产品目标：${record.manifest.proposal?.brief ?? "未记录"}\n\n# 目标页面\n\n${pageFiles.map(({ page }) => `- ${page.title}：${page.path}`).join("\n")}\n\n# 目标体验流程\n\n${flows.length ? flows.map((item) => `- ${item.name}：${item.steps.map((step) => `${step.id} · ${record.manifest.pages.find((page) => page.id === step.pageId)?.title ?? step.pageId}（${step.action}；预期：${step.expected}）`).join(" → ")}`).join("\n") : "- 无"}\n\n# 项目设计令牌\n\n\`\`\`css\n${tokens}\n\`\`\`\n\n# 当前目标页面文件\n\n${pageFiles.map(({ page, html }) => `## ${page.title} · ${page.path}\n\n\`\`\`html\n${html}\n\`\`\``).join("\n\n")}\n`,
  };
}

export function assertProjectGenerationFiles(
  generated: ProjectGenerationContext,
  files: { path: string; content: string }[],
): void {
  const allowed = new Set([...generated.pagePaths, generated.tokensPath]);
  const returned = new Set(files.map((file) => file.path.replace(/\\/g, "/")));
  const disallowed = [...returned].filter((path) => !allowed.has(path));
  const missingPages = generated.pagePaths.filter((path) => !returned.has(path));
  if (disallowed.length) {
    throw new ProjectRepositoryError("INVALID_PROJECT", `模型返回了范围外文件：${disallowed.join(", ")}`);
  }
  if (missingPages.length) {
    throw new ProjectRepositoryError("INVALID_PROJECT", `模型缺少目标页面：${missingPages.join(", ")}`);
  }
}

export function assembleProjectDesignContext(
  repository: ProjectRepository,
  projectId: string,
  pageId: string,
): string {
  const record = repository.get(projectId);
  const page = record.manifest.pages.find((item) => item.id === pageId);
  if (!page) throw new ProjectRepositoryError("NOT_FOUND", "target page not found");
  const relatedFlows = record.manifest.flows.filter((flow) => flow.steps.some((step) => step.pageId === pageId));
  const tokens = repository.readPreviewFile(projectId, record.manifest.designLanguage.tokens).body.toString("utf8");
  const html = repository.readPreviewFile(projectId, page.path).body.toString("utf8");

  return `# 设计项目

项目：${record.manifest.name}
平台：${record.manifest.platform}
策略：${record.manifest.proposal?.strategy ?? "未指定"}
产品目标：${record.manifest.proposal?.brief ?? "未记录"}

# 当前页面

ID：${page.id}
标题：${page.title}
文件：${page.path}
状态：${page.status}

# 相关体验流程

${
  relatedFlows.length
    ? relatedFlows
        .map(
          (flow) =>
            `- ${flow.name}：${flow.steps
              .map((step) => record.manifest.pages.find((item) => item.id === step.pageId)?.title ?? step.pageId)
              .join(" → ")}`,
        )
        .join("\n")
    : "- 无"
}

# 项目设计令牌

\`\`\`css
${tokens}
\`\`\`

# 当前页面文件

\`\`\`html
${html}
\`\`\`
`;
}

export function parseProjectFileReplacements(text: string): { path: string; content: string }[] {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced ?? text;
  let value: unknown;
  try {
    value = JSON.parse(source.trim());
  } catch (error) {
    throw new ProjectRepositoryError("INVALID_PROJECT", "模型没有返回有效的 Project V2 文件事务", { cause: error });
  }
  const files =
    value && typeof value === "object" && Array.isArray((value as { files?: unknown }).files)
      ? (value as { files: unknown[] }).files
      : undefined;
  if (!files?.length) throw new ProjectRepositoryError("INVALID_PROJECT", "模型事务没有包含替换文件");
  return files.map((file) => {
    if (
      !file ||
      typeof file !== "object" ||
      typeof (file as { path?: unknown }).path !== "string" ||
      typeof (file as { content?: unknown }).content !== "string"
    ) {
      throw new ProjectRepositoryError("INVALID_PROJECT", "模型事务包含无效文件");
    }
    return { path: (file as { path: string }).path, content: (file as { content: string }).content };
  });
}

export function parseProjectGenerationResult(text: string): {
  files: { path: string; content: string }[];
  flowSteps?: ProjectFlowAutomationUpdate[];
} {
  const files = parseProjectFileReplacements(text);
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const value = JSON.parse((fenced ?? text).trim()) as { flowSteps?: unknown };
  if (value.flowSteps === undefined) return { files };
  if (!Array.isArray(value.flowSteps)) {
    throw new ProjectRepositoryError("INVALID_PROJECT", "模型返回的可执行流程步骤无效");
  }
  try {
    const commandsSchema = projectFlowCommandSchema.array().min(1).max(40);
    return {
      files,
      flowSteps: value.flowSteps.map((item) => {
        if (!item || typeof item !== "object" || typeof (item as { stepId?: unknown }).stepId !== "string") {
          throw new Error("invalid flow step");
        }
        return {
          stepId: (item as { stepId: string }).stepId,
          commands: commandsSchema.parse((item as { commands?: unknown }).commands),
        };
      }),
    };
  } catch (error) {
    throw new ProjectRepositoryError("INVALID_PROJECT", "模型返回的可执行流程步骤无效", { cause: error });
  }
}
