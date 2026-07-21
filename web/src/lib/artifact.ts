// Extract the deliverable HTML artifact from an assistant message.
// Per the runtime contract, the model outputs the full document in a single
// ```html fenced block. We take the LAST such block as the current artifact.
//
// The core extractors live in the repo-root shared/ module so the server
// (headless agent generation) and the web app share one implementation.
// This file re-exports them and adds web-only helpers (forms, live specs,
// design-system specs, tweaks props).

export {
  stripWorkingAttrs,
  extractArtifact,
  extractMarkdownDoc,
  extractDeliverable,
  extractFiles,
  extractSite,
  stripArtifact,
  hasOpenFence,
} from "../../../shared/extract";
export type { Deliverable, MultiFile, SiteFile, SiteManifest, SitePage, SiteFlow } from "../../../shared/extract";

// ---- Clarifying-question forms (```vdform blocks) --------------------------

// A rich aesthetic-direction card: a palette swatch row + live type samples +
// a mood line, so choosing a "look" is visual instead of textual.
export interface DirectionCard {
  label: string;
  palette: string[];
  displayFont?: string;
  bodyFont?: string;
  mood?: string;
  references?: string[];
}

export interface FormQuestion {
  id: string;
  label: string;
  type: "chips" | "palette" | "text" | "direction" | "number" | "toggle";
  options?: (string | { label: string; colors: string[] } | DirectionCard)[];
  decide?: boolean;
  other?: boolean;
  optional?: boolean;
  hint?: string;
  // number: a stepper with bounds; toggle: a boolean switch (on/off labels).
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number | string;
  on?: string; // toggle: label for the ON state (default "是")
  off?: string; // toggle: label for the OFF state (default "否")
}

export interface QuestionForm {
  title: string;
  questions: FormQuestion[];
}

const FORM_FENCE = /```vdform\s*\n([\s\S]*?)```/i;

export function extractForm(text: string): QuestionForm | null {
  const m = text.match(FORM_FENCE);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]);
    if (parsed && Array.isArray(parsed.questions)) return parsed as QuestionForm;
  } catch {
    /* incomplete stream or bad json */
  }
  return null;
}

export function stripForm(text: string): string {
  return text.replace(FORM_FENCE, "").trim();
}

// ---- Live artifact spec block (```vdlive) -----------------------------------

export type LiveMappingSpec = { from: string; to: string; transform?: "identity" | "compact_table" | "metric_summary" };
export type LiveSourceSpec =
  | { type: "http_json"; url: string; mapping?: LiveMappingSpec[] }
  | { type: "model_prompt"; prompt: string }
  | { type: "local_file"; file: string; mapping?: LiveMappingSpec[] }
  | { type: "connector"; connector: string; params?: Record<string, string>; mapping?: LiveMappingSpec[] };

export interface LiveSpec {
  title: string;
  template: string; // HTML with {{data.path}} holes
  data: unknown;
  source?: LiveSourceSpec;
}

const LIVE_FENCE = /```vdlive\s*\n([\s\S]*?)```/i;

export function extractLiveSpec(text: string): LiveSpec | null {
  const m = text.match(LIVE_FENCE);
  if (!m) return null;
  try {
    const p = JSON.parse(m[1]);
    if (p && typeof p.template === "string") return p as LiveSpec;
  } catch {
    /* incomplete stream or bad json */
  }
  return null;
}

// ---- Design-system spec block (```vddesignsystem) ----------------------------

const DS_FENCE = /```vddesignsystem\s*\n([\s\S]*?)```/i;
const DS_TOKENS_FENCE = /```vddstokens\s*\n([\s\S]*?)```/i;

export function extractDesignSystemSpec(text: string): string | null {
  const m = text.match(DS_FENCE);
  return m ? m[1].trim() : null;
}

// The machine-readable :root {} token contract emitted alongside the prose
// spec. Persisted as DesignSystem.tokensCss and injected as a binding contract.
export function extractDesignSystemTokens(text: string): string | null {
  const m = text.match(DS_TOKENS_FENCE);
  return m ? m[1].trim() : null;
}

// ---- Tweaks props declaration (data-vd-props script tag) --------------------

export interface TweakProp {
  key: string;
  label: string;
  type: "range" | "color";
  value: number | string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  swatches?: string[];
  var: string;
}

export interface TweakGroup {
  label: string;
  props: TweakProp[];
}

const PROPS_TAG = /<script[^>]*data-vd-props[^>]*>([\s\S]*?)<\/script>/i;

export function extractProps(html: string): TweakGroup[] | null {
  const m = html.match(PROPS_TAG);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]);
    if (parsed && Array.isArray(parsed.groups)) return parsed.groups as TweakGroup[];
  } catch {
    /* malformed */
  }
  return null;
}
