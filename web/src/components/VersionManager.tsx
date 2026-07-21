import { useMemo, useState } from "react";
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
const KIND_LABEL: Record<string, string> = { html: "HTML", markdown: "Doc", multifile: "多文件" };

// Version manager (inspired by open-design's FileVersionManagerModal):
// searchable version list + live preview + per-version open / restore / export.
export function VersionManager({ projectId, projectName, artifacts, activeVersionId, onClose, onActivate, onRestore }: Props) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | undefined>(activeVersionId ?? artifacts[artifacts.length - 1]?.id);
  const [confirming, setConfirming] = useState<string | null>(null);

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
  const previewSrc =
    selected?.kind === "multifile" && selected.entry ? `/api/mf/${projectId}/${selected.id}/${selected.entry}` : null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal vm-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t("版本管理")}</h2>
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
                <button key={v.id} className={`vm-row ${v.id === selectedId ? "on" : ""}`} onClick={() => setSelectedId(v.id)}>
                  <span className="vm-src">{SRC_ICON[v.source ?? "ai"]}</span>
                  <span className="vm-main">
                    <span className="vm-title">
                      v{idx + 1} · {v.label || t("未命名")}
                      {v.id === activeVersionId && <span className="vm-active">{t("当前")}</span>}
                    </span>
                    <span className="vm-sub">
                      {KIND_LABEL[v.kind ?? "html"]} · {new Date(v.createdAt).toLocaleString()}
                      {v.prompt ? ` · ${v.prompt}` : ""}
                    </span>
                  </span>
                </button>
              );
            })}
            {list.length === 0 && <p className="muted" style={{ padding: 12, fontSize: 13 }}>{t("没有匹配的版本")}</p>}
          </div>
          <div className="vm-preview">
            {selected ? (
              <>
                {previewSrc ? (
                  <iframe className="vm-frame" src={previewSrc} sandbox="allow-scripts allow-same-origin" title="version preview" />
                ) : (
                  <iframe className="vm-frame" srcDoc={selected.html} sandbox="allow-scripts" title="version preview" />
                )}
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
                  <button className="btn ghost small" onClick={() => void exportVersion(selected, projectName)}>
                    {t("导出")}
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
