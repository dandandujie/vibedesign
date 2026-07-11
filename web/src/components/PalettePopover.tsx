import { useState } from "react";
import { t } from "../lib/i18n";
import { clampPop } from "../lib/popover";

interface Props {
  onShift: (hueDelta: number) => void; // live recolor
  onReset: () => void;
  onSave: () => void;
  onClose: () => void;
}

// W3-A: one-click reskin. Hue-shifts every chromatic color in the artifact
// (tokens + stylesheet colors), preserving saturation/lightness and leaving
// grays untouched — no model round-trip needed.
const PRESETS: { label: string; delta: number }[] = [
  { label: "原色", delta: 0 },
  { label: "暖调 +30°", delta: 30 },
  { label: "橙红 +60°", delta: 60 },
  { label: "对比 +180°", delta: 180 },
  { label: "冷调 -40°", delta: -40 },
  { label: "紫蓝 -80°", delta: -80 },
];

export function PalettePopover({ onShift, onReset, onSave, onClose }: Props) {
  const [hue, setHue] = useState(0);
  const [dirty, setDirty] = useState(false);

  const apply = (h: number) => {
    setHue(h);
    setDirty(h !== 0);
    if (h === 0) onReset();
    else onShift(h);
  };

  return (
    <div className="mini-menu palette-pop" style={{ right: 0, width: 232, padding: 12 }} ref={clampPop}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 14.5, fontWeight: 600 }}>{t("换肤")}</span>
        <span style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 12.5 }}>{hue > 0 ? `+${hue}°` : `${hue}°`}</span>
      </div>
      <input
        type="range"
        min={-180}
        max={180}
        step={1}
        value={hue}
        onChange={(e) => apply(Number(e.target.value))}
        style={{ width: "100%" }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            className={`btn ghost small ${hue === p.delta ? "on" : ""}`}
            style={{ fontSize: 14.5 }}
            onClick={() => apply(p.delta)}
          >
            {t(p.label)}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
        <button className="btn ghost small" onClick={() => { apply(0); }}>
          {t("重置")}
        </button>
        <span style={{ flex: 1 }} />
        <button
          className="btn primary small"
          disabled={!dirty}
          onClick={() => { onSave(); setDirty(false); onClose(); }}
        >
          {t("存为新版本")}
        </button>
      </div>
    </div>
  );
}
