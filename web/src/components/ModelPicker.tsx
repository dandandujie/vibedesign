import { useEffect, useRef, useState } from "react";
import { Meta, ProviderConfig, Effort, setActiveProvider, saveProvider } from "../lib/api";
import { ChevronDown, ChevronRight } from "./icons";
import { clampPop } from "../lib/popover";

interface Props {
  meta: Meta | null;
  onMetaChanged: () => void;
  onOpenSettings: () => void;
  align?: "up" | "down"; // menu opens above (composer) or below (home)
}

const EFFORTS: Effort[] = ["low", "medium", "high"];
const EFFORT_LABEL: Record<Effort, string> = { low: "Low", medium: "Medium", high: "High" };

// Model picker per user's Image 4: trigger "Name  Effort ▾", pop menu with the
// model list (name + description + check), an Effort row (only when the active
// model supports reasoning) and a "More models" submenu for the overflow.
export function ModelPicker({ meta, onMetaChanged, onOpenSettings, align = "up" }: Props) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<null | "effort" | "more">(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSub(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const providers = meta?.providers ?? [];
  const active = providers.find((p) => p.id === meta?.activeProviderId) ?? null;
  const primary = providers.slice(0, 4);
  const more = providers.slice(4);

  const pick = async (p: ProviderConfig) => {
    await setActiveProvider(p.id);
    onMetaChanged();
    setOpen(false);
    setSub(null);
  };

  const setEffort = async (e: Effort) => {
    if (!active) return;
    await saveProvider({ ...active, effort: e });
    onMetaChanged();
    setSub(null);
  };

  return (
    <div className={`model-picker ${align}`} ref={ref}>
      <button
        className="model-trigger"
        onClick={() => {
          setOpen((v) => !v);
          setSub(null);
        }}
      >
        {active ? (
          <>
            <span className="mname">{active.name}</span>
            {active.reasoning && active.effort && (
              <span className="meffort">{EFFORT_LABEL[active.effort]}</span>
            )}
          </>
        ) : (
          <span className="mname muted">未配置模型</span>
        )}
        <span className="chev"><ChevronDown size={12} /></span>
      </button>

      {open && (
        <div className="model-menu" ref={clampPop}>
          {providers.length === 0 && (
            <button
              className="model-item"
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
            >
              <span className="ti">＋ 添加模型服务…</span>
            </button>
          )}
          {primary.map((p) => (
            <button key={p.id} className="model-item" onClick={() => pick(p)}>
              <span className="tx">
                <span className="ti">{p.name}</span>
                {p.description && <span className="td">{p.description}</span>}
              </span>
              {p.id === active?.id && <span className="check">✓</span>}
            </button>
          ))}

          {active?.reasoning && (
            <>
              <div className="model-sep" />
              <button
                className={`model-item row ${sub === "effort" ? "hl" : ""}`}
                onClick={() => setSub(sub === "effort" ? null : "effort")}
              >
                <span className="ti">Effort</span>
                <span className="tail">
                  {active.effort ? EFFORT_LABEL[active.effort] : "—"} <ChevronRight size={12} />
                </span>
              </button>
            </>
          )}

          {more.length > 0 && (
            <button
              className={`model-item row ${sub === "more" ? "hl" : ""}`}
              onClick={() => setSub(sub === "more" ? null : "more")}
            >
              <span className="ti">More models</span>
              <span className="tail">
                <ChevronRight size={12} />
              </span>
            </button>
          )}

          <div className="model-sep" />
          <button
            className="model-item row"
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
          >
            <span className="ti muted">管理模型服务…</span>
          </button>

          {sub === "effort" && active?.reasoning && (
            <div className="model-submenu" ref={clampPop}>
              {EFFORTS.map((e) => (
                <button key={e} className="model-item" onClick={() => setEffort(e)}>
                  <span className="ti">{EFFORT_LABEL[e]}</span>
                  {active.effort === e && <span className="check">✓</span>}
                </button>
              ))}
            </div>
          )}
          {sub === "more" && (
            <div className="model-submenu" ref={clampPop}>
              {more.map((p) => (
                <button key={p.id} className="model-item" onClick={() => pick(p)}>
                  <span className="ti">{p.name}</span>
                  {p.id === active?.id && <span className="check">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
