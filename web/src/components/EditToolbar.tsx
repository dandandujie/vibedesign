export type EditTool = "select" | "interact";

interface Props {
  tool: EditTool;
  onTool: (t: EditTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onDrawTool: (name: string) => void; // draw tools: staged for a later version
}

// Toolbar per user's Images 5-7: select · click-through · text · frame ·
// rectangle · oval · arrow · line · draw · undo · redo.
export function EditToolbar({ tool, onTool, onUndo, onRedo, canUndo, canRedo, onDrawTool }: Props) {
  const draw = (name: string, glyph: string, title: string) => (
    <button className="et-btn" title={`${title}（即将支持）`} onClick={() => onDrawTool(name)}>
      {glyph}
    </button>
  );
  return (
    <div className="edit-toolbar">
      <button
        className={`et-btn ${tool === "select" ? "on" : ""}`}
        title="Select"
        onClick={() => onTool("select")}
      >
        ➤
      </button>
      <button
        className={`et-btn ${tool === "interact" ? "on" : ""}`}
        title="Click through (interact with the page)"
        onClick={() => onTool("interact")}
      >
        ➚
      </button>
      <span className="et-sep" />
      {draw("text", "T", "Text")}
      {draw("frame", "#", "Frame")}
      {draw("rectangle", "▭", "Rectangle")}
      {draw("oval", "○", "Oval")}
      {draw("arrow", "↗", "Arrow")}
      {draw("line", "∕", "Line")}
      {draw("draw", "✎", "Draw")}
      <span className="et-grow" />
      <button className="et-btn" title="Undo" disabled={!canUndo} onClick={onUndo}>
        ↶
      </button>
      <button className="et-btn" title="Redo" disabled={!canRedo} onClick={onRedo}>
        ↷
      </button>
    </div>
  );
}
