import { useRef, useState } from "react";
import { t } from "../lib/i18n";

// A mark drawn on top of the canvas, in canvas-viewport coordinates.
export type Mark =
  | { type: "rect"; x: number; y: number; w: number; h: number }
  | { type: "arrow"; x1: number; y1: number; x2: number; y2: number }
  | { type: "path"; pts: [number, number][] };

type Tool = "draw" | "rect" | "arrow";

interface Props {
  box: { left: number; top: number; width: number; height: number }; // frame position within the stage
  onSend: (marks: Mark[]) => void;
  onClose: () => void;
}

export const ANNOTATE_ACCENT = "#d97757";

// W3-E / A3-3: draw boxes / arrows / scribbles over the canvas, then send a
// composited screenshot to the model ("fix what I circled"). Host-side overlay
// — never touches the artifact DOM.
export function AnnotateDrawOverlay({ box, onSend, onClose }: Props) {
  const [tool, setTool] = useState<Tool>("draw");
  const [marks, setMarks] = useState<Mark[]>([]);
  const [draft, setDraft] = useState<Mark | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drawing = useRef(false);
  const start = useRef<[number, number]>([0, 0]);

  const at = (e: React.PointerEvent): [number, number] => {
    const r = svgRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const down = (e: React.PointerEvent) => {
    drawing.current = true;
    const p = at(e);
    start.current = p;
    if (tool === "draw") setDraft({ type: "path", pts: [p] });
    else if (tool === "rect") setDraft({ type: "rect", x: p[0], y: p[1], w: 0, h: 0 });
    else setDraft({ type: "arrow", x1: p[0], y1: p[1], x2: p[0], y2: p[1] });
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !draft) return;
    const p = at(e);
    if (draft.type === "path") setDraft({ type: "path", pts: [...draft.pts, p] });
    else if (draft.type === "rect")
      setDraft({ type: "rect", x: Math.min(start.current[0], p[0]), y: Math.min(start.current[1], p[1]), w: Math.abs(p[0] - start.current[0]), h: Math.abs(p[1] - start.current[1]) });
    else setDraft({ type: "arrow", x1: start.current[0], y1: start.current[1], x2: p[0], y2: p[1] });
  };
  const up = () => {
    if (draft) setMarks((m) => [...m, draft]);
    setDraft(null);
    drawing.current = false;
  };

  const arrowHead = (m: Extract<Mark, { type: "arrow" }>) => {
    const ang = Math.atan2(m.y2 - m.y1, m.x2 - m.x1);
    const L = 12;
    const p1 = `${m.x2 - L * Math.cos(ang - 0.44)} ${m.y2 - L * Math.sin(ang - 0.44)}`;
    const p2 = `${m.x2 - L * Math.cos(ang + 0.44)} ${m.y2 - L * Math.sin(ang + 0.44)}`;
    return `M${m.x2} ${m.y2} L${p1} L${p2} Z`;
  };

  const render = (m: Mark, key: number | string) => {
    if (m.type === "rect")
      return <rect key={key} x={m.x} y={m.y} width={m.w} height={m.h} fill="none" stroke={ANNOTATE_ACCENT} strokeWidth={2.5} rx={4} />;
    if (m.type === "arrow")
      return (
        <g key={key}>
          <line x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} stroke={ANNOTATE_ACCENT} strokeWidth={2.5} strokeLinecap="round" />
          <path d={arrowHead(m)} fill={ANNOTATE_ACCENT} />
        </g>
      );
    return <path key={key} d={"M" + m.pts.map((p) => p.join(" ")).join(" L")} fill="none" stroke={ANNOTATE_ACCENT} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />;
  };

  return (
    <>
      <svg
        ref={svgRef}
        className="annotate-draw"
        style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
      >
        {marks.map((m, i) => render(m, i))}
        {draft && render(draft, "draft")}
      </svg>
      <div className="annotate-draw-bar" style={{ left: box.left + box.width / 2, top: box.top + 12 }}>
        {([["draw", "✎"], ["rect", "▭"], ["arrow", "↗"]] as [Tool, string][]).map(([tl, ic]) => (
          <button key={tl} className={`iconbtn ${tool === tl ? "on" : ""}`} title={t("画笔")} onClick={() => setTool(tl)}>
            {ic}
          </button>
        ))}
        <button className="iconbtn" title={t("撤销")} disabled={!marks.length} onClick={() => setMarks((m) => m.slice(0, -1))}>
          ⤺
        </button>
        <button className="iconbtn" title={t("清除")} disabled={!marks.length} onClick={() => setMarks([])}>
          ✕
        </button>
        <span className="sep" />
        <button className="btn primary small" disabled={!marks.length} onClick={() => onSend(marks)}>
          {t("发送标注给 Claude")}
        </button>
        <button className="btn ghost small" onClick={onClose}>
          {t("完成")}
        </button>
      </div>
    </>
  );
}
