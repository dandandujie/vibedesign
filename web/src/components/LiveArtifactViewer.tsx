import { useEffect, useState } from "react";
import { t } from "../lib/i18n";
import {
  LiveArtifact,
  refreshLiveArtifact,
  livePreviewUrl,
  getRefreshLog,
  rollbackLiveArtifact,
  RefreshLogEntry,
} from "../lib/liveApi";

interface Props {
  live: LiveArtifact;
  providerId?: string | null;
  onChanged: (updated: LiveArtifact) => void;
}

type Tab = "preview" | "data" | "source" | "history";

// Live Artifacts (advanced): renders the server-composited preview, refreshes
// the data layer (locked + snapshotted + audited server-side), and shows the
// refresh history with rollback to any past snapshot.
export function LiveArtifactViewer({ live, providerId, onChanged }: Props) {
  const [tab, setTab] = useState<Tab>("preview");
  const [version, setVersion] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [log, setLog] = useState<RefreshLogEntry[]>([]);

  const loadLog = async () => setLog((await getRefreshLog(live.id)).slice().reverse());

  useEffect(() => {
    if (tab === "history") void loadLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, live.updatedAt]);

  const refresh = async () => {
    if (busy) return;
    setBusy("refresh");
    setErr(null);
    try {
      onChanged(await refreshLiveArtifact(live.id, providerId));
      setVersion((v) => v + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const rollback = async (refreshId: string) => {
    if (busy) return;
    setBusy(refreshId);
    setErr(null);
    try {
      onChanged(await rollbackLiveArtifact(live.id, refreshId));
      setVersion((v) => v + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const when = live.lastRefreshedAt ? new Date(live.lastRefreshedAt).toLocaleString() : t("从未");
  const eventLabel: Record<RefreshLogEntry["event"], string> = {
    created: "创建",
    started: "开始",
    succeeded: "成功",
    failed: "失败",
    rolled_back: "回滚",
  };

  return (
    <div className="live-viewer">
      <div className="live-bar">
        <span className="live-badge">◎ Live</span>
        <span className="live-title">{live.title}</span>
        <div className="live-tabs">
          {([["preview", "预览"], ["data", "Data"], ["source", "来源"], ["history", "刷新历史"]] as [Tab, string][]).map(
            ([tb, label]) => (
              <button key={tb} className={`live-tab ${tab === tb ? "on" : ""}`} onClick={() => setTab(tb)}>
                {t(label)}
              </button>
            ),
          )}
        </div>
        <div style={{ flex: 1 }} />
        <span className="live-when muted" title={t("上次刷新")}>
          {t("上次刷新")}：{when}
        </span>
        {live.source ? (
          <button className="btn small" disabled={busy === "refresh"} onClick={refresh} title={t("重新拉取数据并渲染")}>
            {busy === "refresh" ? t("刷新中…") : `↻ ${t("刷新")}`}
          </button>
        ) : (
          <span className="muted small">{t("无刷新源")}</span>
        )}
      </div>

      {err && <div className="live-err">⚠ {err}</div>}

      <div className="live-body">
        {tab === "preview" && (
          <iframe key={version} className="live-frame" title="live-artifact" src={livePreviewUrl(live.id, version)} sandbox="" />
        )}
        {tab === "data" && <pre className="live-json">{JSON.stringify(live.dataJson, null, 2)}</pre>}
        {tab === "source" && (
          <pre className="live-json">{live.source ? JSON.stringify(live.source, null, 2) : t("此 Live artifact 没有配置刷新源。")}</pre>
        )}
        {tab === "history" && (
          <div className="live-history">
            {log.length === 0 && <p className="muted small" style={{ padding: 14 }}>{t("暂无刷新记录")}</p>}
            {log.map((e, i) => {
              const canRollback = e.event === "created" || e.event === "succeeded";
              return (
                <div key={i} className={`live-log-row ev-${e.event}`}>
                  <span className="live-log-ev">{t(eventLabel[e.event])}</span>
                  <span className="live-log-time">{new Date(e.at).toLocaleString()}</span>
                  <span className="live-log-sum" title={e.summary}>{e.summary}</span>
                  {canRollback && (
                    <button className="btn ghost small" disabled={!!busy} onClick={() => rollback(e.refreshId)}>
                      {busy === e.refreshId ? "…" : t("回滚到此")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
