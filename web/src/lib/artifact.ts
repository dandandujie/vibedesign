// Extract the deliverable HTML artifact from an assistant message.
// Per the runtime contract, the model outputs the full document in a single
// ```html fenced block. We take the LAST such block as the current artifact.

const FENCE = /```html\s*\n([\s\S]*?)```/gi;

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

// Strip the fenced artifact out of the chat text so the transcript stays
// readable (we render the artifact in the canvas, not inline). Also cuts a
// still-streaming, not-yet-closed ```html block so raw markup never flashes in
// the chat bubble mid-stream.
export function stripArtifact(text: string): string {
  let t = text.replace(FENCE, "");
  t = t.replace(/```vdform\s*\n[\s\S]*?```/gi, ""); // form renders in canvas, not chat
  const openIdx = t.search(/```(html|vdform)/i);
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

export interface FormQuestion {
  id: string;
  label: string;
  type: "chips" | "palette" | "text";
  options?: (string | { label: string; colors: string[] })[];
  decide?: boolean;
  other?: boolean;
  optional?: boolean;
  hint?: string;
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
