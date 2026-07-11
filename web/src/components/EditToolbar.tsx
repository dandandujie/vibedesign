import { t } from "../lib/i18n";
import {
  CursorIcon,
  ClickThroughIcon,
  TextIcon,
  FrameIcon,
  RectIcon,
  OvalIcon,
  ArrowNE,
  LineIcon,
  DrawIcon,
  UndoIcon,
  RedoIcon,
} from "./icons";

export type EditTool =
  | "select"
  | "interact"
  | "text"
  | "frame"
  | "rectangle"
  | "oval"
  | "arrow"
  | "line"
  | "draw";

interface Props {
  tool: EditTool;
  onTool: (t: EditTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

// Toolbar per Images 5-7/13: select · click-through | text frame rect oval
// arrow line draw | undo redo — all real tools now.
export function EditToolbar({ tool, onTool, onUndo, onRedo, canUndo, canRedo }: Props) {
  const btn = (tool2: EditTool, icon: JSX.Element, title: string) => (
    <button className={`et-btn ${tool === tool2 ? "on" : ""}`} title={t(title)} onClick={() => onTool(tool2)}>
      {icon}
    </button>
  );
  return (
    <div className="edit-toolbar">
      {btn("select", <CursorIcon size={15} />, "Select")}
      {btn("interact", <ClickThroughIcon size={15} />, "Click through (interact with the page)")}
      <span className="et-sep" />
      {btn("text", <TextIcon size={15} />, "Text")}
      {btn("frame", <FrameIcon size={15} />, "Frame")}
      {btn("rectangle", <RectIcon size={15} />, "Rectangle")}
      {btn("oval", <OvalIcon size={15} />, "Oval")}
      {btn("arrow", <ArrowNE size={15} />, "Arrow")}
      {btn("line", <LineIcon size={15} />, "Line")}
      {btn("draw", <DrawIcon size={15} />, "Draw")}
      <span className="et-grow" />
      <button className="et-btn" title={t("Undo")} disabled={!canUndo} onClick={onUndo}>
        <UndoIcon size={15} />
      </button>
      <button className="et-btn" title={t("Redo")} disabled={!canRedo} onClick={onRedo}>
        <RedoIcon size={15} />
      </button>
    </div>
  );
}
