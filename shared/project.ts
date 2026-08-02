export const PROJECT_SCHEMA = "vibedesign.project" as const;
export const PROJECT_SCHEMA_VERSION = 1 as const;

export type ProjectPlatform = "web" | "desktop" | "mobile";
export type ProjectPageStatus = "draft" | "deepened";
export type ExperienceFlowStatus = "draft" | "ready-for-review" | "completed";
export type ProjectAssetKind = "image" | "icon" | "font" | "video" | "other";
export type ProjectAssetStatus = "ready" | "placeholder" | "missing";
export type ProjectVersionSource = "ai" | "manual" | "external" | "restore";

export const PROJECT_FLOW_REVIEW_CRITERIA = [
  { id: "visual-hierarchy", label: "视觉层级", description: "主次关系、阅读顺序和界面密度清晰。" },
  { id: "design-language", label: "设计语言", description: "颜色、排版、间距、圆角和组件模式保持一致。" },
  { id: "states-feedback", label: "状态与反馈", description: "空、错、加载和成功状态明确且不会造成含糊跳变。" },
  { id: "responsive", label: "响应式体验", description: "目标视口中的布局与操作经过适配，而非简单缩小。" },
  { id: "accessibility", label: "基础可访问性", description: "名称、焦点、错误关联和状态反馈能够被理解。" },
  { id: "restraint", label: "克制程度", description: "没有与体验目标无关的装饰、模式或功能复杂度。" },
] as const;

export type ProjectFlowReviewCriterionId = typeof PROJECT_FLOW_REVIEW_CRITERIA[number]["id"];

export interface ProjectViewport {
  id: string;
  name: string;
  width: number;
  height: number;
}

export interface ProjectPage {
  id: string;
  path: string;
  title: string;
  status: ProjectPageStatus;
}

export type ProjectFlowTarget =
  | { by: "role"; value: "button" | "link" | "textbox" | "heading" | "alert" | "status"; name?: string }
  | { by: "label" | "text" | "vd-id"; value: string };

export type ProjectFlowCommand =
  | { type: "open" }
  | { type: "click"; target: ProjectFlowTarget }
  | { type: "fill"; target: ProjectFlowTarget; value: string }
  | { type: "expect-visible"; target: ProjectFlowTarget }
  | { type: "expect-text"; target: ProjectFlowTarget; value: string }
  | { type: "expect-field-error"; target: ProjectFlowTarget; value: string }
  | { type: "expect-status"; value: string }
  | { type: "expect-url"; value: string };

export interface ExperienceFlowStep {
  id: string;
  pageId: string;
  action: string;
  expected: string;
  commands: ProjectFlowCommand[];
}

export interface ExperienceFlow {
  id: string;
  name: string;
  status: ExperienceFlowStatus;
  steps: ExperienceFlowStep[];
}

export interface ProjectAssetSource {
  type: "local" | "remote" | "generated";
  uri?: string;
}

export interface ProjectAsset {
  id: string;
  path: string;
  kind: ProjectAssetKind;
  status: ProjectAssetStatus;
  source: ProjectAssetSource;
}

export interface ProjectDesignLanguage {
  tokens: string;
  componentsDir: string;
  source?: {
    type: "blank" | "design-system" | "codebase" | "import";
    id?: string;
  };
}

export interface ProjectSettings {
  designSystemId?: string;
  templateId?: string;
  defaultProviderId?: string;
  defaultModel?: string;
}

export interface ProjectProposal {
  brief: string;
  strategy: "global-draft" | "flow-deepening";
  primaryFlowId?: string;
}

export interface ProjectManifest {
  schema: typeof PROJECT_SCHEMA;
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  id: string;
  name: string;
  platform: ProjectPlatform;
  createdAt: number;
  updatedAt: number;
  entryPageId: string;
  viewports: ProjectViewport[];
  pages: ProjectPage[];
  flows: ExperienceFlow[];
  assets: ProjectAsset[];
  designLanguage: ProjectDesignLanguage;
  settings?: ProjectSettings;
  proposal?: ProjectProposal;
}

export interface ProjectVersion {
  id: string;
  label: string;
  source: ProjectVersionSource;
  createdAt: number;
  changedFiles: string[];
  restoreFromVersionId?: string;
}

export interface ProjectVariant {
  id: string;
  label: string;
  createdAt: number;
  baseVersionId?: string;
}

export interface ProjectIndexEntry {
  id: string;
  name: string;
  directory: string;
  platform: ProjectPlatform;
  updatedAt: number;
  favorite?: boolean;
  missing?: boolean;
  invalid?: boolean;
}

export interface ProjectIndexDocument {
  schemaVersion: 1;
  projects: ProjectIndexEntry[];
}

export interface ProjectRecord {
  directory: string;
  manifest: ProjectManifest;
}

export type PreviewFeedbackCategory = "bug" | "usability" | "migration" | "performance" | "other";

export interface PreviewDiagnostics {
  projects: { total: number; missing: number; invalid: number };
  pages: number;
  flows: Record<ExperienceFlowStatus, number>;
  missingAssets: number;
  migration?: {
    completedAt: number;
    counts: Record<"migrated" | "skipped" | "readonly" | "failed", number>;
  };
}

export interface PreviewSafetyStatus {
  schema: "vibedesign.preview-safety";
  schemaVersion: 1;
  app: { version: string; platform: string; arch: string };
  diagnostics: PreviewDiagnostics;
  migration?: {
    sourceFile: string;
    backupFile: string;
    sourceExists: boolean;
    backupExists: boolean;
    backupVerifiedAtMigration: boolean | null;
    backupIntact: boolean | null;
    sourceChangedSinceMigration: boolean | null;
  };
  rollbackSteps: string[];
  feedbackExcludes: string[];
}

export interface PreviewFeedbackInput {
  category: PreviewFeedbackCategory;
  summary: string;
  steps?: string;
  expected?: string;
  actual?: string;
}

export interface PreviewFeedbackExport {
  file: string;
  createdAt: number;
}

interface ProjectExportBase {
  path: string;
  handoffFile: string;
  handoffDataFile: string;
  files: string[];
  validation: ProjectExportValidation;
}

export type ProjectExport =
  | (ProjectExportBase & { format: "folder"; directory: string })
  | (ProjectExportBase & { format: "zip"; archiveFile: string });

export interface ProjectExportFlowValidation {
  flowId: string;
  flowName: string;
  passed: boolean;
  runtime: ProjectFlowRuntimeReport;
}

export interface ProjectExportValidation {
  status: "passed" | "failed" | "unverified";
  validatedAt: number;
  flows: ProjectExportFlowValidation[];
}

export interface ProjectHandoffFlow {
  id: string;
  name: string;
  status: ExperienceFlowStatus;
  steps: ExperienceFlowStep[];
  validation?: ProjectFlowValidation;
  review?: ProjectFlowReview;
}

export interface ProjectHandoffBundle {
  schema: "vibedesign.handoff";
  schemaVersion: 1;
  exportedAt: number;
  manifest: ProjectManifest;
  designLanguage: {
    tokensPath: string;
    tokensCss: string;
    componentsDir: string;
  };
  assets: ProjectAsset[];
  flows: ProjectHandoffFlow[];
  exportValidation: ProjectExportValidation;
}

export interface ProjectFlowValidation {
  flowId: string;
  validatedAt: number;
  manifestUpdatedAt: number;
  contentHash: string;
  runCompleted: boolean;
  passed: boolean;
  checks: {
    pages: string[];
    tokens: boolean;
    missingAssets: string[];
    runtimeErrors: string[];
    brokenLinks: string[];
    externalRequests: string[];
    horizontalOverflow: string[];
    stepFailures: string[];
    accessibilityIssues: string[];
    inoperableControls: string[];
  };
}

export interface ProjectFlowRuntimeReport {
  runtimeErrors: string[];
  brokenLinks: string[];
  externalRequests: string[];
  horizontalOverflow: string[];
  stepFailures: string[];
  accessibilityIssues: string[];
  inoperableControls: string[];
}

export interface ProjectFlowAutomationUpdate {
  stepId: string;
  commands: ProjectFlowCommand[];
}

export interface ProjectFlowRegressionResult {
  flowId: string;
  flowName: string;
  passed: boolean;
  validation?: ProjectFlowValidation;
  error?: string;
}

export interface ProjectFlowReview {
  flowId: string;
  reviewedAt: number;
  validationContentHash: string;
  acceptedCriteria: ProjectFlowReviewCriterionId[];
  note?: string;
}

export interface CompleteExperienceFlowInput {
  acceptedCriteria: ProjectFlowReviewCriterionId[];
  note?: string;
}

export interface CreateProjectInput {
  parentDirectory: string;
  name: string;
  platform: ProjectPlatform;
  folderName?: string;
  settings?: ProjectSettings;
  proposal?: {
    brief: string;
    pageTitles: string[];
    primaryFlowName?: string;
    strategy: "global-draft" | "flow-deepening";
  };
}

export interface CreateProjectPageInput {
  title: string;
  fileName?: string;
}

export interface RenameProjectPageInput {
  title: string;
}

export interface ReorderProjectPagesInput {
  pageIds: string[];
}

export interface CreateExperienceFlowInput {
  name: string;
  pageIds: string[];
}

export interface RenameExperienceFlowInput {
  name: string;
}

export interface RegisterProjectAssetInput {
  path: string;
  kind: ProjectAssetKind;
  source: ProjectAssetSource;
}
