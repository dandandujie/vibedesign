import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "../lib/i18n";
import { ArtifactVersion } from "../lib/types";
import { exportVersion } from "../lib/exporters";
import { XIcon } from "./icons";

interface Props {
  projectId: string;
  projectName: string;
  artifacts: ArtifactVersion[];
  activeVersionId?: string | null;
  onClose: () => void;
  onActivate: (id: string) => void;
  onRestore: (v: ArtifactVersion) => void;
}

const SRC_ICON: Record<string, string> = { ai: "🤖", manual: "✎", restore: "↩" };
const SRC_LABEL: Record<string, string> = { ai: "AI", manual: "手动", restore: "恢复" };
const KIND_LABEL: Record<string, string> = { html: "HTML", markdown: "Doc", multifile: "多文件" };

// Logical width the preview renders at, then CSS-scaled to fit the pane.
const PREVIEW_W = 1100;

// Version manager (inspired by open-design's FileVersionManagerModal):
// searchable version list + scaled live preview + open / restore / export.
export function VersionManager({ projectId, projectName, artifacts, activeVersionId, onClose, onActivate, onRestore }: Props) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | undefined>(activeVersionId ?? artifacts[artifacts.length - 1]?.id);
  const [confirming, setConfirming] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  // Fit the fixed-width preview into whatever space the pane has. Multi-file
  // versions are fitted by height (page strip); single-file by width.
  const selectedKind = artifacts.find((v) => v.id === selectedId)?.kind ?? "html";
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => {
      if (selectedKind === "multifile") setScale(Math.min(1, (el.clientHeight - 24) / 948, el.clientWidth / 634));
      else setScale(Math.min(1, el.clientWidth / PREVIEW_W));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [selectedKind]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...artifacts].reverse(); // newest first
    if (!q) return sorted;
    return sorted.filter(
      (v, i) =>
        (v.label ?? "").toLowerCase().includes(q) ||
        (v.prompt ?? "").toLowerCase().includes(q) ||
        `v${artifacts.length - i}`.includes(q),
    );
  }, [artifacts, query]);

  const selected = artifacts.find((v) => v.id === selectedId) ?? null;
  const selectedIdx = selected ? artifacts.findIndex((a) => a.id === selected.id) : -1;
  const previewSrc =
    selected?.kind === "multifile" && selected.entry ? `/api/mf/${projectId}/${selected.id}/${selected.entry}` : null;
  // Multi-file versions preview ALL pages side by side (not just the entry).
  const mfPages: { path: string; title: string }[] =
    selected?.kind === "multifile" && selected.files
      ? (selected.site?.pages ?? []).filter((p) => selected.files?.[p.path]).length
        ? (selected.site?.pages ?? []).filter((p) => selected.files?.[p.path])
        : Object.keys(selected.files)
            .filter((p) => /\.html?$/i.test(p))
            .map((p) => ({ path: p, title: p }))
      : [];
  // Sized wrapper keeps scrollbars proportional to the SCALED strip (no dead space).
  const stripW = mfPages.length * 586 + 48;
  const stripH = 948;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal vm-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t("版本管理")}</h2>
          <span className="vm-count muted">{artifacts.length} {t("个版本")}</span>
          <button className="iconbtn" onClick={onClose}>
            <XIcon size={13} />
          </button>
        </header>
        <div className="vm-body">
          <div className="vm-list">
            <input className="vm-search" placeholder={t("搜索版本（名称 / prompt / v3）")} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
            {list.map((v) => {
              const idx = artifacts.findIndex((a) => a.id === v.id);
              return (
                <button key={v.id} className={`vm-row ${v.id === selectedId ? "on" : ""}`} onClick={() => { setSelectedId(v.id); setConfirming(null); }}>
                  <span className="vm-row-top">
                    <span className="vm-v">v{idx + 1}</span>
                    <span className="vm-chip">{SRC_ICON[v.source ?? "ai"]} {SRC_LABEL[v.source ?? "ai"]}</span>
                    <span className="vm-chip ghost">{KIND_LABEL[v.kind ?? "html"]}</span>
                    {v.id === activeVersionId && <span className="vm-active">{t("当前")}</span>}
                  </span>
                  <span className="vm-title">{v.label || t("未命名")}</span>
                  <span className="vm-sub">
                    {new Date(v.createdAt).toLocaleString()}
                    {v.prompt ? ` · ${v.prompt}` : ""}
                  </span>
                </button>
              );
            })}
            {list.length === 0 && <p className="muted" style={{ padding: 12, fontSize: 13 }}>{t("没有匹配的版本")}</p>}
          </div>
          <div className="vm-preview">
            {selected ? (
              <>
                <div className="vm-preview-head">
                  <span className="vm-preview-title">
                    v{selectedIdx + 1} · {selected.label || t("未命名")}
                  </span>
                  <span className="muted" style={{ fontSize: 12 }}>{new Date(selected.createdAt).toLocaleString()}</span>
                </div>
                <div className="vm-preview-stage" ref={stageRef}>
                  {selected.kind === "multifile" && mfPages.length ? (
                    <div className="vm-pages-stage">
                      <div style={{ width: stripW * scale, height: stripH * scale }}>
                        <div className="vm-pages-strip" style={{ transform: `scale(${scale})` }}>
                          {mfPages.map((p) => (
                            <div className="vm-page-card" key={p.path}>
                              <iframe src={`/api/mf/${projectId}/${selected.id}/${p.path}`} sandbox="allow-scripts allow-same-origin" title={p.title} />
                              <span className="vm-page-title">{p.title}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="vm-preview-scale" style={{ transform: `scale(${scale})`, width: PREVIEW_W }}>
                      {previewSrc ? (
                        <iframe className="vm-frame" src={previewSrc} sandbox="allow-scripts allow-same-origin" title="version preview" />
                      ) : (
                        <iframe className="vm-frame" srcDoc={selected.html} sandbox="allow-scripts" title="version preview" />
                      )}
                    </div>
                  )}
                </div>
                <div className="vm-actions">
                  <button
                    className="btn black small"
                    disabled={selected.id === activeVersionId}
                    onClick={() => {
                      onActivate(selected.id);
                      onClose();
                    }}
                  >
                    {t("在画布打开")}
                  </button>
                  {confirming === selected.id ? (
                    <>
                      <button
                        className="btn primary small"
                        onClick={() => {
                          onRestore(selected);
                          setConfirming(null);
                          onClose();
                        }}
                      >
                        {t("确认恢复")}
                      </button>
                      <button className="btn ghost small" onClick={() => setConfirming(null)}>
                        {t("取消")}
                      </button>
                    </>
                  ) : (
                    <button className="btn small" onClick={() => setConfirming(selected.id)}>
                      {t("恢复为此版本")}
                    </button>
                  )}
                  <div style={{ flex: 1 }} />
                  <button className="btn ghost small" onClick={() => void exportVersion(selected, projectName)}>
                    ↓ {t("导出")}
                  </button>
                </div>
              </>
            ) : (
              <div className="vm-empty muted">{t("选择一个版本查看预览")}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
