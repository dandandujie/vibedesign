// Extract the deliverable HTML artifact from an assistant message.
// Per the runtime contract, the model outputs the full document in a single
// ```html fenced block. We take the LAST such block as the current artifact.

import { markdownToHtml } from "./mddoc";

const FENCE = /```html\s*\n([\s\S]*?)```/gi;

// Strip internal working attributes (stable ids) so exported / presented /
// shared HTML is pristine. Working HTML carries data-vd-id for stable
// selection & pin locating; it must never leak into a deliverable.
export function stripWorkingAttrs(html: string): string {
  return html.replace(/\s+data-vd-id="[^"]*"/g, "");
}

export function extractArtifact(text: string): string | null {
  let last: string | null = null;
  let m: RegExpExecArray | null;
  FENCE.lastIndex = 0;
  while ((m = FENCE.exec(text)) !== null) {
    last = m[1];
  }
  if (last == null) return null;
  return last.trim();
}

// ---- deliverable renderer registry (A6-3) ----------------------------------
// The model delivers either a visual design (```html) or a prose/document
// deliverable (```mddoc, markdown). extractDeliverable dispatches to the right
// renderer and always returns canvas-ready HTML + the kind, so everything
// downstream (canvas, versions, export, present) works uniformly.

// Greedy to the LAST ``` so a document that itself contains fenced code blocks
// (```js …```) is captured whole rather than truncated at the first inner fence.
// The mddoc block is the deliverable, so nothing meaningful follows it.
const MDDOC_FENCE = /```mddoc\s*\n([\s\S]*)```/i;

export function extractMarkdownDoc(text: string): string | null {
  const m = text.match(MDDOC_FENCE);
  return m ? m[1].trim() : null;
}

export interface Deliverable {
  kind: "html" | "markdown";
  html: string; // canvas-ready HTML (markdown is rendered to a styled document)
  title: string;
}

export function extractDeliverable(text: string): Deliverable | null {
  // position of the LAST ```html block
  let htmlPos = -1;
  let mm: RegExpExecArray | null;
  FENCE.lastIndex = 0;
  while ((mm = FENCE.exec(text)) !== null) htmlPos = mm.index;
  // position of the ```mddoc block
  const md = text.match(MDDOC_FENCE);
  const mdPos = md ? (md.index ?? -1) : -1;

  if (htmlPos === -1 && mdPos === -1) return null;
  // whichever comes later is the actual deliverable
  if (mdPos > htmlPos && md) {
    const src = md[1].trim();
    const title = src.match(/^#\s+(.+)$/m)?.[1]?.trim().slice(0, 40) ?? "文档";
    return { kind: "markdown", html: markdownToHtml(src, title), title };
  }
  const html = extractArtifact(text);
  if (!html) return null;
  const title = text.match(/^####\s+(.+)$/m)?.[1]?.trim().slice(0, 40) ?? "设计";
  return { kind: "html", html, title };
}

// ---- Multi-file artifacts (```vdfiles blocks) ------------------------------
// A preview.entry model: one HTML entry plus sibling files (styles.css, app.js,
// components/…) served over /api/mf. Block shape (no JSON escaping pain, streams
// cleanly):
//
//   ```vdfiles
//   entry: index.html
//   === index.html ===
//   <!doctype html> …
//   === styles.css ===
//   :root { … }
//   ```
//
// This is additive: single-file ```html stays the default; only an explicit
// vdfiles block produces a multi-file artifact.
const VDFILES_FENCE = /```vdfiles\s*\n([\s\S]*?)```/i;

export interface MultiFile {
  entry: string;
  files: Record<string, string>;
}

export function extractFiles(text: string): MultiFile | null {
  const m = text.match(VDFILES_FENCE);
  if (!m) return null;
  const body = m[1];
  const files: Record<string, string> = {};
  let entry = "";
  // optional leading "entry: <path>" before the first === separator
  const firstSep = body.search(/^===\s+.+\s+===\s*$/m);
  const head = firstSep === -1 ? body : body.slice(0, firstSep);
  const entryMatch = head.match(/^\s*entry:\s*(.+?)\s*$/m);
  if (entryMatch) entry = entryMatch[1].trim();
  // split on "=== path ===" section markers
  const rest = firstSep === -1 ? "" : body.slice(firstSep);
  const re = /^===[ \t]+(.+?)[ \t]+===[ \t]*$/gm;
  const marks: { path: string; lineStart: number; contentStart: number }[] = [];
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(rest)) !== null) marks.push({ path: mm[1].trim(), lineStart: mm.index, contentStart: re.lastIndex });
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].lineStart : rest.length;
    const content = rest.slice(marks[i].contentStart, end).replace(/^\n/, "").replace(/\s+$/, "");
    files[marks[i].path] = content + "\n";
  }
  const paths = Object.keys(files);
  if (!paths.length) return null;
  if (!entry || !files[entry]) entry = paths.find((p) => /\.html?$/i.test(p)) ?? paths[0];
  return { entry, files };
}

// Strip the fenced artifact out of the chat text so the transcript stays
// readable (we render the artifact in the canvas, not inline). Also cuts a
// still-streaming, not-yet-closed ```html block so raw markup never flashes in
// the chat bubble mid-stream.
export function stripArtifact(text: string): string {
  let t = text.replace(FENCE, "");
  t = t.replace(/```vdform\s*\n[\s\S]*?```/gi, ""); // form renders in canvas, not chat
  t = t.replace(/```vddesignsystem\s*\n[\s\S]*?```/gi, "（design system 规范已生成）");
  t = t.replace(/```vddstokens\s*\n[\s\S]*?```/gi, ""); // token contract stored, not shown in chat
  t = t.replace(/```vdlive\s*\n[\s\S]*?```/gi, "（可刷新的 Live 设计已生成）");
  t = t.replace(/```vdfiles\s*\n[\s\S]*?```/gi, "（多文件设计已生成）");
  // mddoc may contain inner ``` fences; it's the last deliverable, so strip to end
  t = t.replace(/```mddoc\s*\n[\s\S]*/i, "（文档已生成）");
  const openIdx = t.search(/```(html|vdform|vddesignsystem|vddstokens|vdlive|vdfiles|mddoc)/i);
  if (openIdx !== -1) t = t.slice(0, openIdx) + "\n正在生成设计…";
  // Drop leading markdown heading markers (the "#### <name>" artifact title
  // line and any prose headings) so the chat reads as plain conversation.
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

// True while an artifact fence has opened but not yet closed — used to show a
// "designing…" placeholder in the canvas during streaming.
export function hasOpenFence(text: string): boolean {
  const opens = (text.match(/```html/gi) || []).length;
  const closes = (text.match(/```/g) || []).length;
  // each opening ```html counts one closing ``` too; artifact open if unbalanced
  return closes < opens * 2;
}

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
