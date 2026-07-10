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

export interface SelectedInfo {
  path: string;
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

export interface ArtifactVersion {
  id: string;
  html: string;
  label: string;
  createdAt: number;
}

export type Device = "desktop" | "tablet" | "mobile";
