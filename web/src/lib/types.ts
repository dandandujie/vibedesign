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
}

export interface SelectedInfo {
  path: string;
  tag: string;
  text: string;
  editable: boolean;
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

export interface ArtifactVersion {
  id: string;
  html: string;
  label: string;
  createdAt: number;
}

export type Device = "desktop" | "tablet" | "mobile";
