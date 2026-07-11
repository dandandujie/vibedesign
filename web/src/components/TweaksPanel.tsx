import { useEffect, useRef, useState } from "react";
import { t } from "../lib/i18n";
import { TweakGroup, TweakProp } from "../lib/artifact";

interface PanelProps {
  groups: TweakGroup[];
  onSetVar: (cssVar: string, cssValue: string, raw: number | string) => void;
  onAskMore: (description: string) => void;
  onSaveVersion: () => void;
  onClose: () => void;
  embedded?: boolean; // rendered inside the Edit panel's Tweaks tab
}

// Tweaks panel per field study §7: grouped controls auto-rendered from the
// props declaration — range → slider with unit, color → curated swatches.
export function TweaksPanel({ groups, onSetVar, onAskMore, onSaveVersion, onClose, embedded }: PanelProps) {
  const [values, setValues] = useState<Record<string, number | string>>(() => {
    const v: Record<string, number | string> = {};
    groups.forEach((g) => g.props.forEach((p) => (v[p.key] = p.value)));
    return v;
  });
  const [asking, setAsking] = useState(false);
  const [dirty, setDirty] = useState(false);

  const apply = (p: TweakProp, raw: number | string) => {
    setValues((prev) => ({ ...prev, [p.key]: raw }));
    const cssValue = p.type === "range" ? `${raw}${p.unit ?? ""}` : String(raw);
    onSetVar(p.var, cssValue, raw);
    setDirty(true);
  };

  return (
    <div className={embedded ? "tweaks-embed" : "tweaks-panel"}>
      {!embedded && (
        <div className="head">
          <span>Tweaks</span>
          <button className="iconbtn" onClick={onClose} style={{ padding: "0 2px" }}>
            ✕
          </button>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.label}>
          <div className="group-label">{g.label}</div>
          {g.props.map((p) => (
            <div className="tweak-row" key={p.key} style={{ marginTop: 6 }}>
              <div className="lab">
                <span>{p.label}</span>
                {p.type === "range" && (
                  <span className="val">
                    {values[p.key]}
                    {p.unit ?? ""}
                  </span>
                )}
              </div>
              {p.type === "range" ? (
                <input
                  type="range"
                  min={p.min ?? 0}
                  max={p.max ?? 100}
                  step={p.step ?? 1}
                  value={Number(values[p.key])}
                  onChange={(e) => apply(p, Number(e.target.value))}
                />
              ) : (
                <div className="swatches">
                  {(p.swatches ?? [String(p.value)]).map((c) => (
                    <button
                      key={c}
                      className={`swatch ${values[p.key] === c ? "on" : ""}`}
                      style={{ background: c }}
                      title={c}
                      onClick={() => apply(p, c)}
                    >
                      {values[p.key] === c ? "✓" : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
        {dirty && (
          <button className="btn small" onClick={() => { onSaveVersion(); setDirty(false); }}>
            {t("存为新版本")}
          </button>
        )}
        <button className="btn ghost small" onClick={() => setAsking(true)}>
          {t("＋ 添加控件")}
        </button>
      </div>

      {asking && <TweaksAsk inline onSubmit={(d) => { setAsking(false); onAskMore(d); }} onCancel={() => setAsking(false)} />}
    </div>
  );
}

interface AskProps {
  inline?: boolean;
  onSubmit: (description: string) => void;
  onCancel: () => void;
}

// The "describe what you want to tweak" box shown when no props exist yet
// (or when adding more). Submission becomes a structured instruction message.
export function TweaksAsk({ inline, onSubmit, onCancel }: AskProps) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const body = (
    <>
      <input
        ref={ref}
        placeholder={t("描述想调什么，如：标题字号和 CTA 颜色")}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && text.trim()) onSubmit(text.trim());
          if (e.key === "Escape") onCancel();
        }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 6 }}>
        <button className="btn ghost small" onClick={onCancel}>
          {t("取消")}
        </button>
        <button className="btn primary small" disabled={!text.trim()} onClick={() => onSubmit(text.trim())}>
          {t("生成控件")}
        </button>
      </div>
    </>
  );

  if (inline) return <div style={{ marginTop: 4 }}>{body}</div>;
  return <div className="tweaks-ask">{body}</div>;
}
