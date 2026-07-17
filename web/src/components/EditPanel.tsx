import { useEffect, useState } from "react";
import { t } from "../lib/i18n";
import { SelectedInfo, TreeNode } from "../lib/types";
import { TweakGroup } from "../lib/artifact";
import { TweaksPanel } from "./TweaksPanel";
import { EditToolbar, EditTool } from "./EditToolbar";

type Tab = "simple" | "pro" | "code" | "tweaks";

interface Props {
  selected: SelectedInfo | null;
  tweakGroups: TweakGroup[] | null;
  html: string;
  editTool: EditTool;
  onEditTool: (t: EditTool) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onApplyStyle: (prop: string, value: string) => void;
  onApplyText: (value: string) => void;
  onSetAttr: (name: string, value: string | null) => void;
  onSelectPath: (path: string) => void;
  getTree: () => Promise<TreeNode | null>;
  exportPng: (selector: string | null, scale: number) => Promise<string | null>;
  onSetVar: (cssVar: string, cssValue: string, raw: number | string) => void;
  onAskTweaks: (description: string) => void;
  onSave: () => void;
  onDiscard: () => void;
}

export function EditPanel(props: Props) {
  const [tab, setTab] = useState<Tab>("simple");

  const toolbar = (
    <EditToolbar
      tool={props.editTool}
      onTool={props.onEditTool}
      onUndo={props.onUndo}
      onRedo={props.onRedo}
      canUndo={props.canUndo}
      canRedo={props.canRedo}
    />
  );

  return (
    <section className="chat edit-panel">
      {/* Image 13: "Edit … Discard [Save]" row, then plain-text tabs */}
      <div className="edit-head">
        <span className="edit-title">{t("Edit")}</span>
        <div style={{ flex: 1 }} />
        <button className="edit-discard" onClick={props.onDiscard}>
          {t("Discard")}
        </button>
        <button className="btn primary" onClick={props.onSave}>
          {t("Save")}
        </button>
      </div>
      <div className="edit-tabs">
        {([["simple", "Simple"], ["pro", "Pro"], ["code", "Code"], ["tweaks", "Tweaks"]] as [Tab, string][]).map(([tb, label]) => (
          <button key={tb} className={`edit-tab ${tab === tb ? "on" : ""}`} onClick={() => setTab(tb)}>
            {t(label)}
          </button>
        ))}
      </div>

      <div className="edit-body">
        {tab === "simple" && (
          <>
            {toolbar}
            <AppearanceSection {...props} />
            <BorderSection {...props} />
            <ExportSection {...props} />
          </>
        )}
        {tab === "pro" && (
          <>
            <LayerTreeSection {...props} />
            {toolbar}
            <AppearanceSection {...props} />
            <SizingSection {...props} />
            <PositionSection {...props} />
            <LayoutSection {...props} />
            <SpacingSection {...props} kind="padding" />
            <SpacingSection {...props} kind="margin" />
            <BorderSection {...props} />
            <TypographySection {...props} />
            <ExportSection {...props} />
            <DebugSection {...props} />
          </>
        )}
        {tab === "code" && (
          <>
            <LayerTreeSection {...props} />
            {toolbar}
            <DeclarationsEditor {...props} />
          </>
        )}
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

// ---- shared field bits --------------------------------------------------------

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ep-row">
      <span className="ep-label">{label}</span>
      <span className="ep-value">{children}</span>
    </div>
  );
}

function NumInput({
  value,
  suffix,
  onCommit,
}: {
  value: number | string;
  suffix?: string;
  onCommit: (v: string) => void;
}) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <input
      className="ep-num"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onCommit(v)}
      onKeyDown={(e) => e.key === "Enter" && onCommit(v)}
      placeholder={suffix}
    />
  );
}

function needSelection(selected: SelectedInfo | null) {
  if (selected) return null;
  return (
    <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6, padding: "2px 2px", margin: 0 }}>
      {t("Click any element on the canvas to edit it.")}
    </p>
  );
}

// ---- Appearance (Image 5) -------------------------------------------------------

function AppearanceSection({ selected, onApplyStyle }: Props) {
  const [extra, setExtra] = useState<string | null>(null);
  const empty = needSelection(selected);
  return (
    <div className="ep-section">
      <div className="ep-head">{t("Appearance")}</div>
      {empty ?? (
        <>
          <Row label={t("Background")}>
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(selected!.styles.backgroundColor) ? selected!.styles.backgroundColor : "#ffffff"}
              onChange={(e) => onApplyStyle("backgroundColor", e.target.value)}
            />
            <button className="ep-mini" onClick={() => onApplyStyle("backgroundColor", "transparent")}>
              {t("None")}
            </button>
          </Row>
          <div className="ep-grid2">
            <Row label={t("Radius")}>
              <NumInput value={selected!.styles.borderRadius} suffix="px" onCommit={(v) => onApplyStyle("borderRadius", `${parseFloat(v) || 0}px`)} />
            </Row>
            <Row label={t("Overflow")}>
              <select
                className="ep-select"
                value={selected!.styles.overflow}
                onChange={(e) => onApplyStyle("overflow", e.target.value)}
              >
                {["visible", "hidden", "auto", "scroll"].map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </Row>
            <Row label={t("Opacity")}>
              <NumInput value={selected!.styles.opacity} onCommit={(v) => {
                const opacity = parseFloat(v);
                onApplyStyle("opacity", String(Math.min(1, Math.max(0, Number.isFinite(opacity) ? opacity : 1))));
              }} />
            </Row>
            <Row label={t("Z-index")}>
              <NumInput value={selected!.styles.zIndex} suffix="auto" onCommit={(v) => onApplyStyle("zIndex", v || "auto")} />
            </Row>
          </div>
          <div className="ep-add">
            Add:{" "}
            {(["shadow", "text shadow", "transform", "filter"] as const).map((k) => (
              <button key={k} className="ep-add-link" onClick={() => setExtra(extra === k ? null : k)}>
                {t(k)}
              </button>
            ))}
          </div>
          {extra && (
            <ExtraInput
              kind={extra}
              selected={selected!}
              onApplyStyle={onApplyStyle}
              onDone={() => setExtra(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

function ExtraInput({
  kind,
  selected,
  onApplyStyle,
  onDone,
}: {
  kind: string;
  selected: SelectedInfo;
  onApplyStyle: (p: string, v: string) => void;
  onDone: () => void;
}) {
  const propMap: Record<string, { prop: string; initial: string; hint: string }> = {
    shadow: { prop: "boxShadow", initial: selected.styles.boxShadow || "0 4px 16px rgba(0,0,0,.12)", hint: "0 4px 16px rgba(0,0,0,.12)" },
    "text shadow": { prop: "textShadow", initial: selected.styles.textShadow || "0 1px 2px rgba(0,0,0,.25)", hint: "0 1px 2px rgba(0,0,0,.25)" },
    transform: { prop: "transform", initial: selected.styles.transform || "rotate(0deg)", hint: "rotate(3deg) scale(1.02)" },
    filter: { prop: "filter", initial: selected.styles.filter || "blur(0px)", hint: "blur(2px) saturate(1.2)" },
    border: { prop: "border", initial: selected.styles.border || "1px solid #e5e5e5", hint: "1px solid #e5e5e5" },
  };
  const cfg = propMap[kind];
  const [v, setV] = useState(cfg.initial);
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
      <input
        className="ep-num"
        style={{ flex: 1, textAlign: "left" }}
        value={v}
        placeholder={cfg.hint}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onApplyStyle(cfg.prop, v);
            onDone();
          }
        }}
        autoFocus
      />
      <button
        className="btn primary small"
        onClick={() => {
          onApplyStyle(cfg.prop, v);
          onDone();
        }}
      >
        {t("应用")}
      </button>
    </div>
  );
}

// ---- Border ----------------------------------------------------------------------

function BorderSection({ selected, onApplyStyle }: Props) {
  const [editing, setEditing] = useState(false);
  if (!selected) return null;
  return (
    <div className="ep-section">
      <div className="ep-head">
        {t("Border")}
        <button className="ep-add-link" style={{ marginLeft: "auto" }} onClick={() => setEditing((v) => !v)}>
          {selected.styles.border ? "Edit border" : "Add border"}
        </button>
      </div>
      {editing && (
        <ExtraInput
          kind="border"
          selected={selected}
          onApplyStyle={(_, v) => onApplyStyle("border", v)}
          onDone={() => setEditing(false)}
        />
      )}
    </div>
  );
}

// ---- Sizing (Image 6) ---------------------------------------------------------------

type SizeMode = "hug" | "fixed" | "fill";
function sizeMode(raw: string): SizeMode {
  if (!raw || raw === "auto" || raw === "fit-content") return "hug";
  if (raw === "100%") return "fill";
  return "fixed";
}

function SizingSection({ selected, onApplyStyle }: Props) {
  if (!selected) return null;
  const dim = (label: "Width" | "Height", prop: "width" | "height", raw: string, px: number) => {
    const mode = sizeMode(raw);
    const set = (m: SizeMode) => {
      if (m === "hug") onApplyStyle(prop, "auto");
      else if (m === "fill") onApplyStyle(prop, "100%");
      else onApplyStyle(prop, `${px}px`);
    };
    return (
      <div className="ep-row">
        <span className="ep-label">{label}</span>
        <span className="ep-value">
          <NumInput value={px} suffix="px" onCommit={(v) => onApplyStyle(prop, `${parseFloat(v) || px}px`)} />
          <span className="seg" style={{ marginLeft: 6 }}>
            {(["hug", "fixed", "fill"] as SizeMode[]).map((m) => (
              <button key={m} className={mode === m ? "on" : ""} onClick={() => set(m)}>
                {t(m === "hug" ? "Hug" : m === "fixed" ? "Fixed" : "Fill")}
              </button>
            ))}
          </span>
        </span>
      </div>
    );
  };
  return (
    <div className="ep-section">
      <div className="ep-head">{t("Sizing")}</div>
      {dim("Width", "width", selected.styles.widthRaw, selected.styles.width)}
      {dim("Height", "height", selected.styles.heightRaw, selected.styles.height)}
      <Row label={t("Align self")}>
        <select className="ep-select" value={selected.styles.alignSelf} onChange={(e) => onApplyStyle("alignSelf", e.target.value)}>
          {["auto", "flex-start", "center", "flex-end", "stretch"].map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </Row>
    </div>
  );
}

function PositionSection({ selected, onApplyStyle }: Props) {
  if (!selected) return null;
  const abs = selected.styles.position === "absolute";
  return (
    <div className="ep-section">
      <div className="ep-head">{t("Position")}</div>
      <div className="seg">
        <button className={!abs ? "on" : ""} onClick={() => onApplyStyle("position", "static")}>
          {t("Inline")}
        </button>
        <button className={abs ? "on" : ""} onClick={() => onApplyStyle("position", "absolute")}>
          {t("Absolute")}
        </button>
      </div>
    </div>
  );
}

function LayoutSection({ selected, onApplyStyle }: Props) {
  if (!selected) return null;
  return (
    <div className="ep-section">
      <div className="ep-head">{t("Contents layout")}</div>
      <Row label={t("Display")}>
        <select className="ep-select" value={selected.styles.display} onChange={(e) => onApplyStyle("display", e.target.value)}>
          {["block", "flex", "grid", "inline-block", "inline", "none"].map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </Row>
    </div>
  );
}

// ---- Padding / Margin ---------------------------------------------------------------

function SpacingSection({ selected, onApplyStyle, kind }: Props & { kind: "padding" | "margin" }) {
  const [mode, setMode] = useState<"none" | "all" | "xy" | "ind">("all");
  if (!selected) return null;
  const s = selected.styles;
  const base = kind === "padding" ? [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft] : [s.marginTop, 0, s.marginBottom, 0];
  const apply = (t: number, r: number, b: number, l: number) =>
    onApplyStyle(kind, `${t}px ${r}px ${b}px ${l}px`);
  return (
    <div className="ep-section">
      <div className="ep-head">
        {kind === "padding" ? "Padding" : "Margin"}
        <span className="seg" style={{ marginLeft: "auto" }}>
          {(
            [
              ["none", "None"],
              ["all", "All"],
              ["xy", "X & Y"],
              ["ind", "Individual"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              className={mode === m ? "on" : ""}
              onClick={() => {
                setMode(m);
                if (m === "none") apply(0, 0, 0, 0);
              }}
            >
              {t(label)}
            </button>
          ))}
        </span>
      </div>
      {mode === "all" && (
        <Row label={t("All")}>
          <NumInput value={base[0]} suffix="px" onCommit={(v) => { const n = parseFloat(v) || 0; apply(n, n, n, n); }} />
        </Row>
      )}
      {mode === "xy" && (
        <div className="ep-grid2">
          <Row label="X">
            <NumInput value={base[1]} suffix="px" onCommit={(v) => { const n = parseFloat(v) || 0; apply(base[0], n, base[2], n); }} />
          </Row>
          <Row label="Y">
            <NumInput value={base[0]} suffix="px" onCommit={(v) => { const n = parseFloat(v) || 0; apply(n, base[1], n, base[3]); }} />
          </Row>
        </div>
      )}
      {mode === "ind" && (
        <div className="ep-grid2">
          {(["Top", "Right", "Bottom", "Left"] as const).map((side, i) => (
            <Row key={side} label={side}>
              <NumInput
                value={base[i]}
                suffix="px"
                onCommit={(v) => {
                  const arr = [...base];
                  arr[i] = parseFloat(v) || 0;
                  apply(arr[0], arr[1], arr[2], arr[3]);
                }}
              />
            </Row>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Typography (kept from the old Simple tab) -----------------------------------------

function TypographySection({ selected, onApplyStyle, onApplyText }: Props) {
  const [text, setText] = useState(selected?.text ?? "");
  useEffect(() => setText(selected?.text ?? ""), [selected?.path]);
  if (!selected) return null;
  return (
    <div className="ep-section">
      <div className="ep-head">{t("Type")}</div>
      {(selected.kind === "text" || selected.kind === "link") && (
        <textarea
          className="ep-text"
          rows={2}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onApplyText(e.target.value);
          }}
        />
      )}
      <div className="ep-grid2">
        <Row label={t("Size")}>
          <NumInput value={selected.styles.fontSize} suffix="px" onCommit={(v) => onApplyStyle("fontSize", `${parseFloat(v) || 16}px`)} />
        </Row>
        <Row label={t("Weight")}>
          <select className="ep-select" value={String(selected.styles.fontWeight)} onChange={(e) => onApplyStyle("fontWeight", e.target.value)}>
            {["300", "400", "500", "600", "700", "800"].map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </Row>
        <Row label={t("Color")}>
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(selected.styles.color) ? selected.styles.color : "#000000"}
            onChange={(e) => onApplyStyle("color", e.target.value)}
          />
        </Row>
        <Row label={t("Align")}>
          <select className="ep-select" value={selected.styles.textAlign} onChange={(e) => onApplyStyle("textAlign", e.target.value)}>
            {["left", "center", "right", "justify"].map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </Row>
      </div>
    </div>
  );
}

// ---- Layer tree -----------------------------------------------------------------------

function LayerTreeSection({ getTree, onSelectPath, selected, html }: Props) {
  const [tree, setTree] = useState<TreeNode | null>(null);
  useEffect(() => {
    let stale = false;
    const t = setTimeout(() => getTree().then((tr) => !stale && setTree(tr)), 300);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [html]);

  if (!tree) return <p className="muted small">{t("读取图层中…")}</p>;
  return (
    <div className="layer-tree ep-tree">
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
      {open && node.kids.map((k, i) => <TreeRow key={i} node={k} depth={depth + 1} activePath={activePath} onPick={onPick} />)}
    </>
  );
}

// ---- Code tab: per-element declarations (Image 7) ---------------------------------------

function DeclarationsEditor({ selected, onApplyStyle, onSetAttr }: Props) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!selected) return setText("");
    const lines = selected.inlineStyle
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s + ";");
    if (selected.cls) lines.push(`@class: ${selected.cls};`);
    setText(lines.join("\n"));
  }, [selected?.path, selected?.inlineStyle]);

  if (!selected) return needSelection(null);

  const apply = () => {
    for (const raw of text.split("\n")) {
      const line = raw.trim().replace(/;$/, "");
      if (!line) continue;
      const m = line.match(/^(@?)([\w-]+)\s*:\s*(.*)$/);
      if (!m) continue;
      const [, at, name, value] = m;
      if (at) onSetAttr(name, value || null);
      else onApplyStyle(name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), value);
    }
  };

  return (
    <div className="ep-section">
      <textarea
        className="code-decls"
        spellCheck={false}
        value={text}
        placeholder={"background: #fff;\nborder-radius: 12px;\n@class: card;"}
        onChange={(e) => setText(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") apply();
        }}
      />
      <p className="muted" style={{ fontSize: 13, margin: "6px 0 0" }}>
        {t("One declaration per line; @name edits an attribute.")}
      </p>
    </div>
  );
}

// ---- Export selection (Images 5/6) ---------------------------------------------------

function ExportSection({ selected, exportPng }: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const [scale, setScale] = useState(2);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stale = false;
    setPreview(null);
    const t = setTimeout(() => {
      exportPng(selected?.path ?? null, 1).then((url) => !stale && setPreview(url));
    }, 400);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [selected?.path]);

  const doExport = async () => {
    setBusy(true);
    const url = await exportPng(selected?.path ?? null, scale);
    setBusy(false);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = "export.png";
    a.click();
  };

  return (
    <div className="ep-section">
      <div className="ep-head">{t("Export selection")}</div>
      <div className="export-preview">
        {preview ? <img src={preview} alt="" /> : <span className="muted small">{t("预览生成中…")}</span>}
      </div>
      <div className="ep-grid2">
        <Row label={t("Format")}>
          <select className="ep-select" value="PNG" onChange={() => {}}>
            <option>PNG</option>
          </select>
        </Row>
        <Row label={t("Scale")}>
          <select className="ep-select" value={scale} onChange={(e) => setScale(Number(e.target.value))}>
            {[1, 2, 3].map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </Row>
      </div>
      <button className="btn primary" style={{ alignSelf: "flex-end" }} disabled={busy} onClick={doExport}>
        {busy ? "导出中…" : "Export PNG"}
      </button>
    </div>
  );
}

function DebugSection({ selected }: Props) {
  if (!selected) return null;
  return (
    <div className="ep-section">
      <div className="ep-head">{t("Debug")}</div>
      <pre className="ep-debug">
        {JSON.stringify({ tag: selected.tag, path: selected.path, class: selected.cls }, null, 0)}
      </pre>
    </div>
  );
}

function AskTweaksInline({ onSubmit }: { onSubmit: (d: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p className="muted" style={{ margin: 0, lineHeight: 1.6, fontSize: 13.5 }}>
        {t("这个设计还没有可调控件。描述想调什么，Claude 会生成对应的滑块/色板。")}
      </p>
      <input
        style={{ border: "1px solid var(--border-default)", borderRadius: 8, padding: "8px 10px", fontSize: 14, fontFamily: "inherit" }}
        placeholder={t("如：标题字号和 CTA 颜色")}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && text.trim() && onSubmit(text.trim())}
      />
      <button className="btn primary small" style={{ alignSelf: "flex-end" }} disabled={!text.trim()} onClick={() => onSubmit(text.trim())}>
        {t("生成控件")}
      </button>
    </div>
  );
}
