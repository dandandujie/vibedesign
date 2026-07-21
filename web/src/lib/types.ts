export interface SelectedStyles {
  color: string;
  backgroundColor: string;
  fontSize: number;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
  textAlign: string;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  marginTop: number;
  marginBottom: number;
  borderRadius: number;
  overflow: string;
  opacity: number;
  zIndex: string;
  display: string;
  position: string;
  width: number;
  height: number;
  widthRaw: string;
  heightRaw: string;
  alignSelf: string;
  boxShadow: string;
  border: string;
  transform: string;
  filter: string;
  textShadow: string;
}

export type ElementKind = "text" | "link" | "image" | "container";

export interface SelectedInfo {
  path: string;
  vid: string; // stable data-vd-id (empty for legacy/non-discoverable elements)
  kind: ElementKind;
  tag: string;
  text: string;
  editable: boolean;
  cls: string;
  inlineStyle: string;
  rect: { x: number; y: number; w: number; h: number };
  styles: SelectedStyles;
}

export type CanvasMode = "browse" | "comment" | "edit";

export interface TreeNode {
  tag: string;
  cls: string;
  text: string;
  path: string;
  kids: TreeNode[];
}

export type VersionSource = "ai" | "manual" | "restore";

import type { SiteManifest } from "../../../shared/extract";

export interface ArtifactVersion {
  id: string;
  html: string;
  label: string;
  createdAt: number;
  kind?: "html" | "markdown" | "multifile"; // deliverable renderer (A6-3); default html
  source?: VersionSource; // provenance: how this version came to be
  prompt?: string; // the user prompt that produced an AI version (snippet)
  restoreFromVersionId?: string; // set when this version restores an earlier one
  // Multi-file artifact (kind === "multifile"): preview.entry + sibling files,
  // served over /api/mf. `html` mirrors the entry so single-file paths still work.
  files?: Record<string, string>;
  entry?: string;
  // Site / flow prototype (from a ```vdsite block): page list + user flows from
  // the site.json manifest — drives the page tabs in the multi-file viewer.
  site?: SiteManifest;
}

export type Device = "desktop" | "tablet" | "mobile";

// A rect (iframe-viewport coords) keyed by an arbitrary id — used to position
// live-following comment pins over the canvas.
export type RectMap = Record<string, { x: number; y: number; w: number; h: number }>;
export interface PinTarget {
  id: string;
  vid?: string;
  path: string;
}
