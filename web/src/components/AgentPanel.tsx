import { useCallback, useEffect, useState } from "react";
import { t } from "../lib/i18n";

interface AgentStatus {
  slug: string;
  name: string;
  cliDetected: boolean;
  mcpConfigured: boolean;
  skillInstalled: boolean;
  supportsSkill: boolean;
  note?: string;
}

interface IntegrationsState {
  launch: { command: string; args: string[] } | null;
  launchError: string | null;
  agents: AgentStatus[];
}

// Settings → Agent 打通: one-click MCP/skill install per agent. The server
// performs the actual config writes (/api/agent-integrations); this panel is
// status + checkboxes. An agent counts as connected when its MCP config (or,
// for skill-only Pi, the /design skill) is present.
export function AgentPanel() {
  const [state, setState] = useState<IntegrationsState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ slug: string; ok: boolean; lines: string[] } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/agent-integrations");
      setState(await r.json());
    } catch {
      setState(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const act = async (slug: string, action: "install" | "uninstall") => {
    setBusy(slug);
    setMessage(null);
    try {
      const r = await fetch(`/api/agent-integrations/${slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await r.json();
      const lines: string[] = [...(body.log ?? []), ...(body.skipped ?? [])];
      if (body.error) lines.push(`✗ ${body.error}`);
      setMessage({ slug, ok: r.ok && body.ok, lines });
    } catch (err) {
      setMessage({ slug, ok: false, lines: [String(err)] });
    } finally {
      setBusy(null);
      void refresh();
    }
  };

  if (!state) return <p className="muted small">{t("读取 agent 状态中…")}</p>;

  return (
    <div className="agent-panel">
      <p className="small muted" style={{ margin: 0 }}>
        {t("勾选即可把 Vibedesign 接入对应的 coding agent（写入 MCP 配置 + /design 技能）。接入后在 agent 里说 /design 或让它「设计一个页面」，即可驱动 Vibedesign 生成并回传设计。")}
      </p>
      {state.launchError && <p className="agent-warn">⚠ {state.launchError}</p>}
      <div className="agent-list">
        {state.agents.map((a) => {
          const connected = a.mcpConfigured || (a.slug === "pi" && a.skillInstalled);
          return (
            <div key={a.slug} className="agent-row">
              <label className="agent-main">
                <input
                  type="checkbox"
                  checked={connected}
                  disabled={busy === a.slug || (!connected && !!state.launchError && a.slug !== "pi")}
                  onChange={(e) => void act(a.slug, e.target.checked ? "install" : "uninstall")}
                />
                <span className="agent-name">{a.name}</span>
                {a.cliDetected && <span className="agent-badge">CLI</span>}
                {a.mcpConfigured && <span className="agent-badge ok">MCP</span>}
                {a.supportsSkill && a.skillInstalled && <span className="agent-badge ok">/design</span>}
              </label>
              <span className="agent-status">
                {busy === a.slug ? t("处理中…") : connected ? `● ${t("已打通")}` : `○ ${t("未打通")}`}
              </span>
              {message?.slug === a.slug && (
                <div className={`agent-msg ${message.ok ? "" : "err"}`}>
                  {message.lines.map((l, i) => (
                    <div key={i}>{l}</div>
                  ))}
                </div>
              )}
              {a.note && !message && <div className="agent-note muted small">{a.note}</div>}
            </div>
          );
        })}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        {t("提示：安装后需重启对应 agent CLI 生效；Vibedesign 需保持运行（桌面版或 npm run dev）。")}
      </p>
    </div>
  );
}
