import { z } from "zod";
import {
  PROJECT_SCHEMA,
  PROJECT_SCHEMA_VERSION,
  type CreateProjectInput,
  type ProjectManifest,
  type ProjectPlatform,
  type ProjectViewport,
} from "../../shared/project.js";

const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

export function isSafeProjectRelativePath(value: string): boolean {
  if (!value || value.includes("\0")) return false;
  const normalized = value.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized)) return false;
  const parts = normalized.split("/");
  return parts.every((part) => part !== "" && part !== "." && part !== "..");
}

const idSchema = z.string().regex(ID_RE);
const relativePathSchema = z.string().refine(isSafeProjectRelativePath, "must be a safe relative project path");

const viewportSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(80),
  width: z.number().int().min(240).max(7680),
  height: z.number().int().min(240).max(7680),
});

const pageSchema = z.object({
  id: idSchema,
  path: relativePathSchema,
  title: z.string().min(1).max(160),
  status: z.enum(["draft", "deepened"]),
});

const flowTargetSchema = z.discriminatedUnion("by", [
  z.object({
    by: z.literal("role"),
    value: z.enum(["button", "link", "textbox", "heading", "alert", "status"]),
    name: z.string().min(1).max(200).optional(),
  }),
  z.object({ by: z.enum(["label", "text", "vd-id"]), value: z.string().min(1).max(500) }),
]);

export const projectFlowCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("open") }),
  z.object({ type: z.literal("click"), target: flowTargetSchema }),
  z.object({ type: z.literal("fill"), target: flowTargetSchema, value: z.string().max(2000) }),
  z.object({ type: z.literal("expect-visible"), target: flowTargetSchema }),
  z.object({ type: z.literal("expect-text"), target: flowTargetSchema, value: z.string().min(1).max(2000) }),
  z.object({ type: z.literal("expect-field-error"), target: flowTargetSchema, value: z.string().min(1).max(2000) }),
  z.object({ type: z.literal("expect-status"), value: z.string().min(1).max(2000) }),
  z.object({ type: z.literal("expect-url"), value: relativePathSchema }),
]);

const flowStepSchema = z.object({
  id: idSchema,
  pageId: idSchema,
  action: z.string().min(1).max(500),
  expected: z.string().min(1).max(500),
  commands: z.array(projectFlowCommandSchema).max(40).default([]),
});

const flowSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(160),
  status: z.enum(["draft", "ready-for-review", "completed"]),
  steps: z.array(flowStepSchema),
});

const assetSchema = z.object({
  id: idSchema,
  path: relativePathSchema,
  kind: z.enum(["image", "icon", "font", "video", "other"]),
  status: z.enum(["ready", "placeholder", "missing"]),
  source: z.object({
    type: z.enum(["local", "remote", "generated"]),
    uri: z.string().max(2048).optional(),
  }),
});

const settingsSchema = z.object({
  designSystemId: z.string().min(1).max(256).optional(),
  templateId: z.string().min(1).max(256).optional(),
  defaultProviderId: z.string().min(1).max(256).optional(),
  defaultModel: z.string().min(1).max(256).optional(),
});

const proposalSchema = z.object({
  brief: z.string().min(1).max(2000),
  strategy: z.enum(["global-draft", "flow-deepening"]),
  primaryFlowId: idSchema.optional(),
});

export const projectManifestSchema = z
  .object({
    schema: z.literal(PROJECT_SCHEMA),
    schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
    id: idSchema,
    name: z.string().min(1).max(160),
    platform: z.enum(["web", "desktop", "mobile"]),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    entryPageId: idSchema,
    viewports: z.array(viewportSchema).min(1),
    pages: z.array(pageSchema).min(1),
    flows: z.array(flowSchema),
    assets: z.array(assetSchema),
    designLanguage: z.object({
      tokens: relativePathSchema,
      componentsDir: relativePathSchema,
      source: z
        .object({
          type: z.enum(["blank", "design-system", "codebase", "import"]),
          id: z.string().min(1).max(256).optional(),
        })
        .optional(),
    }),
    settings: settingsSchema.optional(),
    proposal: proposalSchema.optional(),
  })
  .superRefine((manifest, ctx) => {
    const pageIds = new Set<string>();
    const pagePaths = new Set<string>();
    for (const page of manifest.pages) {
      if (pageIds.has(page.id)) ctx.addIssue({ code: "custom", message: `duplicate page id: ${page.id}`, path: ["pages"] });
      if (pagePaths.has(page.path)) ctx.addIssue({ code: "custom", message: `duplicate page path: ${page.path}`, path: ["pages"] });
      pageIds.add(page.id);
      pagePaths.add(page.path);
    }
    if (!pageIds.has(manifest.entryPageId)) {
      ctx.addIssue({ code: "custom", message: "entryPageId must reference a page", path: ["entryPageId"] });
    }
    const flowIds = new Set<string>();
    for (const flow of manifest.flows) {
      if (flowIds.has(flow.id)) ctx.addIssue({ code: "custom", message: `duplicate flow id: ${flow.id}`, path: ["flows"] });
      flowIds.add(flow.id);
      const stepIds = new Set<string>();
      for (const step of flow.steps) {
        if (stepIds.has(step.id)) ctx.addIssue({ code: "custom", message: `duplicate step id: ${step.id}`, path: ["flows"] });
        if (!pageIds.has(step.pageId)) {
          ctx.addIssue({ code: "custom", message: `flow step references unknown page: ${step.pageId}`, path: ["flows"] });
        }
        stepIds.add(step.id);
      }
    }
    if (manifest.proposal?.primaryFlowId && !flowIds.has(manifest.proposal.primaryFlowId)) {
      ctx.addIssue({ code: "custom", message: "proposal primaryFlowId must reference a flow", path: ["proposal"] });
    }
    const assetPaths = new Set<string>();
    for (const asset of manifest.assets) {
      if (assetPaths.has(asset.path)) ctx.addIssue({ code: "custom", message: `duplicate asset path: ${asset.path}`, path: ["assets"] });
      assetPaths.add(asset.path);
    }
  });

export function parseProjectManifest(value: unknown): ProjectManifest {
  return projectManifestSchema.parse(value) as ProjectManifest;
}

export function defaultViewports(platform: ProjectPlatform): ProjectViewport[] {
  if (platform === "mobile") return [{ id: "mobile", name: "手机", width: 390, height: 844 }];
  if (platform === "desktop") return [{ id: "desktop", name: "桌面", width: 1440, height: 900 }];
  return [
    { id: "desktop", name: "桌面", width: 1440, height: 900 },
    { id: "mobile", name: "手机", width: 390, height: 844 },
  ];
}

export function createProjectManifest(input: CreateProjectInput, id: string, now = Date.now()): ProjectManifest {
  const pageTitles = input.proposal?.pageTitles.map((title) => title.trim()).filter(Boolean) ?? [];
  const requestedPages = pageTitles.length ? pageTitles : ["首页"];
  const pages = requestedPages.map((title, index) => ({
    id: index === 0 ? "home" : `page-${index + 1}`,
    path: index === 0 ? "pages/index.html" : `pages/page-${index + 1}.html`,
    title,
    status: "draft" as const,
  }));
  const primaryFlowName = input.proposal?.primaryFlowName?.trim();
  const primaryFlowId = primaryFlowName ? "primary-flow" : undefined;
  return parseProjectManifest({
    schema: PROJECT_SCHEMA,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id,
    name: input.name.trim(),
    platform: input.platform,
    createdAt: now,
    updatedAt: now,
    entryPageId: pages[0].id,
    viewports: defaultViewports(input.platform),
    pages,
    flows: primaryFlowName
      ? [
          {
            id: primaryFlowId,
            name: primaryFlowName,
            status: "draft",
            steps: pages.map((page, index) => ({
              id: `primary-step-${index + 1}`,
              pageId: page.id,
              action: index === 0 ? `打开“${page.title}”` : `前往“${page.title}”`,
              expected: `显示“${page.title}”页面`,
              commands: [
                { type: "open" },
                { type: "expect-visible", target: { by: "role", value: "heading", name: page.title } },
              ],
            })),
          },
        ]
      : [],
    assets: [],
    designLanguage: {
      tokens: "tokens.css",
      componentsDir: "components",
      source: input.settings?.designSystemId ? { type: "design-system", id: input.settings.designSystemId } : { type: "blank" },
    },
    ...(input.settings ? { settings: input.settings } : {}),
    ...(input.proposal
      ? {
          proposal: {
            brief: input.proposal.brief.trim(),
            strategy: input.proposal.strategy,
            ...(primaryFlowId ? { primaryFlowId } : {}),
          },
        }
      : {}),
  });
}
