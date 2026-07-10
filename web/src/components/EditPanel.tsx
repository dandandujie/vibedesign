import { useEffect, useState } from "react";
import { SelectedInfo, SelectedStyles, TreeNode } from "../lib/types";
import { TweakGroup } from "../lib/artifact";
import { TweaksPanel } from "./TweaksPanel";

type Tab = "simple" | "pro" | "code" | "tweaks";

interface Props {
  selected: SelectedInfo | null;
  tweakGroups: TweakGroup[] | null;
  html: string;
  onApplyStyle: (prop: keyof SelectedStyles | string, value: string) => void;
  onApplyText: (value: string) => void;
  onSelectPath: (path: string) => void;
  getTree: () => Promise<TreeNode | null>;
  onApplyCode: (html: string) => void;
  onSetVar: (cssVar: string, cssValue: string, raw: number | string) => void;
  onAskTweaks: (description: string) => void;
  onSave: () => void;
  onDiscard: () => void;
}

const WEIGHTS = ["300", "400", "500", "600", "700", "800"];
const ALIGNS: [string, string][] = [
  ["left", "左"],
  ["center", "中"],
  ["right", "右"],
];

// Edit mode swaps the chat pane for this panel (field study §8): a Figma-lite
// with Simple (properties) / Pro (layer tree) / Code / Tweaks tabs plus
// Discard & Save. "Click any element on the canvas to edit it."
export function EditPanel(props: Props) {
  const [tab, setTab] = useState<Tab>("simple");

  return (
    <section className="chat edit-panel">
      <div className="chat-head">
        <span style={{ fontSize: 12, fontWeight: 600 }}>Edit</span>
        <div style={{ flex: 1 }} />
        <button className="btn ghost small" onClick={props.onDiscard}>
          Discard
        </button>
        <button className="btn primary small" onClick={props.onSave}>
          Save
        </button>
      </div>

      <div className="edit-tabs">
        {(["simple", "pro", "code", "tweaks"] as Tab[]).map((t) => (
          <button key={t} className={`edit-tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
            {t === "simple" ? "Simple" : t === "pro" ? "Pro" : t === "code" ? "Code" : "Tweaks"}
          </button>
        ))}
      </div>

      <div className="edit-body">
        {tab === "simple" && <SimpleTab {...props} />}
        {tab === "pro" && <ProTab {...props} />}
        {tab === "code" && <CodeTab html={props.html} onApplyCode={props.onApplyCode} />}
        {tab === "tweaks" &&
          (props.tweakGroups ? (
            <TweaksPanel
              embedded
              groups={props.tweakGroups}
              onSetVar={props.onSetVar}
              onAskMore={props.onAskTweaks}
              onSaveVersion={props.onSave}
              onClose={() => {}}
            />
          ) : (
            <AskTweaksInline onSubmit={props.onAskTweaks} />
          ))}
      </div>
    </section>
  );
}

// ---- Simple: property controls for the selected element ---------------------

function SimpleTab({ selected, onApplyStyle, onApplyText }: Props) {
  const [s, setS] = useState<SelectedStyles | null>(selected?.styles ?? null);
  const [text, setText] = useState(selected?.text ?? "");

  useEffect(() => {
    setS(selected?.styles ?? null);
    setText(selected?.text ?? "");
  }, [selected?.path]);

  if (!selected || !s) {
    return (
      <p className="muted small" style={{ lineHeight: 1.6, padding: "4px 2px" }}>
        Click any element on the canvas to edit it. Shift 后续版本支持多选。
      </p>
    );
  }

  const set = (prop: keyof SelectedStyles, value: number | string, css?: string) => {
    setS((prev) => (prev ? ({ ...prev, [prop]: value } as SelectedStyles) : prev));
    onApplyStyle(prop, css ?? `${value}px`);
  };

  const knob = (label: string, prop: keyof SelectedStyles, min: number, max: number) => (
    <div className="knob">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={Number(s[prop]) || 0}
        onChange={(e) => set(prop, Number(e.target.value))}
      />
      <span className="val">{Math.round(Number(s[prop]) || 0)}</span>
    </div>
  );

  return (
    <div className="refine-groups">
      <div className="sel-tag">
        <span className="tag">&lt;{selected.tag}&gt;</span>
        <span className="muted small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected.text.slice(0, 30)}
        </span>
      </div>

      {selected.editable && (
        <div className="group">
          <label>文字</label>
          <textarea
            rows={2}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              onApplyText(e.target.value);
            }}
          />
        </div>
      )}

      <div className="group">
        <label>排版</label>
        {knob("字号", "fontSize", 8, 96)}
        <div className="knob">
          <span>字重</span>
          <div className="seg" style={{ gridColumn: "2 / span 2" }}>
            {WEIGHTS.map((w) => (
              <button key={w} className={String(s.fontWeight) === w ? "on" : ""} onClick={() => set("fontWeight", w, w)}>
                {w}
              </button>
            ))}
          </div>
        </div>
        <div className="knob">
          <span>对齐</span>
          <div className="seg" style={{ gridColumn: "2 / span 2" }}>
            {ALIGNS.map(([v, label]) => (
              <button key={v} className={s.textAlign === v ? "on" : ""} onClick={() => set("textAlign", v, v)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="group">
        <label>间距</label>
        {knob("内上", "paddingTop", 0, 120)}
        {knob("内下", "paddingBottom", 0, 120)}
        {knob("内左", "paddingLeft", 0, 120)}
        {knob("内右", "paddingRight", 0, 120)}
        {knob("外上", "marginTop", 0, 120)}
        {knob("外下", "marginBottom", 0, 120)}
        {knob("圆角", "borderRadius", 0, 60)}
      </div>

      <div className="group">
        <label>颜色</label>
        <div className="row">
          <input
            type="color"
            value={/^#([0-9a-f]{6})$/i.test(s.color) ? s.color : "#000000"}
            onChange={(e) => set("color", e.target.value, e.target.value)}
          />
          <span className="small muted">文字 {s.color}</span>
        </div>
        <div className="row">
          <input
            type="color"
            value={/^#([0-9a-f]{6})$/i.test(s.backgroundColor) ? s.backgroundColor : "#ffffff"}
            onChange={(e) => set("backgroundColor", e.target.value, e.target.value)}
          />
          <span className="small muted">背景 {s.backgroundColor}</span>
        </div>
      </div>
    </div>
  );
}

// ---- Pro: layer tree ---------------------------------------------------------

function ProTab({ getTree, onSelectPath, selected, html }: Props) {
  const [tree, setTree] = useState<TreeNode | null>(null);

  useEffect(() => {
    let stale = false;
    // slight delay so the iframe has (re)rendered before we snapshot the DOM
    const t = setTimeout(() => getTree().then((tr) => !stale && setTree(tr)), 300);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [html]);

  if (!tree) return <p className="muted small">读取图层中…</p>;
  return (
    <div className="layer-tree">
      <TreeRow node={tree} depth={0} activePath={selected?.path ?? null} onPick={onSelectPath} />
    </div>
  );
}

function TreeRow({
  node,
  depth,
  activePath,
  onPick,
}: {
  node: TreeNode;
  depth: number;
  activePath: string | null;
  onPick: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  return (
    <>
      <div
        className={`layer-row ${activePath === node.path ? "on" : ""}`}
        style={{ paddingLeft: 6 + depth * 12 }}
        onClick={() => onPick(node.path)}
      >
        {node.kids.length > 0 ? (
          <button
            className="layer-chev"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="layer-chev" />
        )}
        <span className="layer-tag">{node.tag}</span>
        {node.cls && <span className="layer-cls">.{node.cls}</span>}
        {node.text && <span className="layer-text">{node.text}</span>}
      </div>
      {open && node.kids.map((k, i) => (
        <TreeRow key={i} node={k} depth={depth + 1} activePath={activePath} onPick={onPick} />
      ))}
    </>
  );
}

// ---- Code ---------------------------------------------------------------------

function CodeTab({ html, onApplyCode }: { html: string; onApplyCode: (h: string) => void }) {
  const [code, setCode] = useState(html);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!touched) setCode(html);
  }, [html]);

  return (
    <div className="code-tab">
      <textarea
        spellCheck={false}
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          setTouched(true);
        }}
      />
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button
          className="btn ghost small"
          disabled={!touched}
          onClick={() => {
            setCode(html);
            setTouched(false);
          }}
        >
          还原
        </button>
        <button
          className="btn primary small"
          disabled={!touched}
          onClick={() => {
            onApplyCode(code);
            setTouched(false);
          }}
        >
          应用到画布
        </button>
      </div>
    </div>
  );
}

function AskTweaksInline({ onSubmit }: { onSubmit: (d: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p className="muted small" style={{ margin: 0, lineHeight: 1.6 }}>
        这个设计还没有可调控件。描述想调什么，Claude 会生成对应的滑块/色板。
      </p>
      <input
        style={{
          border: "1px solid var(--border-default)",
          borderRadius: 8,
          padding: "7px 9px",
          fontSize: 12,
          fontFamily: "inherit",
        }}
        placeholder="如：标题字号和 CTA 颜色"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && text.trim() && onSubmit(text.trim())}
      />
      <button className="btn primary small" style={{ alignSelf: "flex-end" }} disabled={!text.trim()} onClick={() => onSubmit(text.trim())}>
        生成控件
      </button>
    </div>
  );
}
