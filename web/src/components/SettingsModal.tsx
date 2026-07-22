import { useState } from "react";
import { t } from "../lib/i18n";
import {
  Meta,
  ProviderConfig,
  ProviderFormat,
  saveProvider,
  deleteProvider,
  setActiveProvider,
} from "../lib/api";
import { AgentPanel } from "./AgentPanel";

interface Props {
  meta: Meta;
  onClose: () => void;
  onChanged: () => void;
}

const FORMATS: { v: ProviderFormat; label: string; modelHint: string }[] = [
  { v: "anthropic", label: "Anthropic (Claude)", modelHint: "claude-opus-4-8" },
  { v: "openai", label: "OpenAI 兼容 (chat/completions)", modelHint: "gpt-4o" },
  { v: "openai-responses", label: "OpenAI Responses", modelHint: "gpt-4o" },
  { v: "gemini", label: "Google Gemini", modelHint: "gemini-2.0-flash" },
];

function blank(defaults: Record<ProviderFormat, string>): ProviderConfig {
  return {
    id: crypto.randomUUID(),
    name: "",
    format: "anthropic",
    baseUrl: defaults.anthropic,
    apiKey: "",
    model: "",
  };
}

export function SettingsModal({ meta, onClose, onChanged }: Props) {
  const [editing, setEditing] = useState<ProviderConfig | null>(null);
  const [tab, setTab] = useState<"providers" | "agents">("providers");

  const startAdd = () => setEditing(blank(meta.defaultBaseUrls));
  const startEdit = (p: ProviderConfig) => setEditing({ ...p });

  const save = async () => {
    if (!editing) return;
    const e = { ...editing };
    if (!e.name.trim()) e.name = FORMATS.find((f) => f.v === e.format)?.label ?? "Provider";
    if (!e.model.trim()) return alert(t("请填写模型名称（model）"));
    try {
      await saveProvider(e);
    } catch (err) {
      // e.g. reusing a masked key while changing baseUrl/format — the server
      // rejects it; surface it instead of closing as if the edit was saved.
      return alert(err instanceof Error ? err.message : String(err));
    }
    setEditing(null);
    onChanged();
  };

  const remove = async (id: string) => {
    await deleteProvider(id);
    onChanged();
  };

  const activate = async (id: string) => {
    await setActiveProvider(id);
    onChanged();
  };

  const hint = FORMATS.find((f) => f.v === editing?.format)?.modelHint;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t("设置")}</h2>
          <button className="btn ghost small" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="edit-tabs" style={{ padding: "0 20px" }}>
          {([["providers", "模型服务"], ["agents", "Agent 打通"]] as const).map(([tb, label]) => (
            <button key={tb} className={`edit-tab ${tab === tb ? "on" : ""}`} onClick={() => setTab(tb)}>
              {t(label)}
            </button>
          ))}
        </div>
        {tab === "agents" ? (
          <div className="content">
            <AgentPanel />
          </div>
        ) : (
        <div className="content">
          <p className="small muted" style={{ margin: 0 }}>
            {t("支持 Anthropic / OpenAI（含 Responses）/ Gemini 格式，可添加任意兼容服务（自建、代理、第三方）。 API Key 只保存在本地服务端，不会写进浏览器。")}
          </p>

          {meta.providers.map((p) => (
            <div key={p.id} className={`provider-card ${p.id === meta.activeProviderId ? "active" : ""}`}>
              <div className="provider-row">
                <span className="name">{p.name}</span>
                <span className="fmt">{p.format}</span>
                <span className="spacer" />
                {p.id === meta.activeProviderId ? (
                  <span className="small" style={{ color: "var(--accent-hover)", fontWeight: 600 }}>
                    ● {t("使用中")}
                  </span>
                ) : (
                  <button className="btn small" onClick={() => activate(p.id)}>
                    {t("设为使用中")}
                  </button>
                )}
                <button className="btn ghost small" onClick={() => startEdit(p)}>
                  {t("编辑")}
                </button>
                <button className="btn ghost small" onClick={() => remove(p.id)}>
                  {t("删除")}
                </button>
              </div>
              <div className="small muted">
                {p.model} · {p.baseUrl}
              </div>
            </div>
          ))}

          {editing ? (
            <div className="provider-card" style={{ borderColor: "var(--accent)" }}>
              <div className="field">
                <label>{t("名称")}</label>
                <input
                  value={editing.name}
                  placeholder={t("例如：我的 Claude")}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div className="grid2">
                <div className="field">
                  <label>{t("格式")}</label>
                  <select
                    value={editing.format}
                    onChange={(e) => {
                      const format = e.target.value as ProviderFormat;
                      setEditing({ ...editing, format, baseUrl: meta.defaultBaseUrls[format] });
                    }}
                  >
                    {FORMATS.map((f) => (
                      <option key={f.v} value={f.v}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>{t("模型 model")}</label>
                  <input
                    value={editing.model}
                    placeholder={hint}
                    onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                  />
                </div>
              </div>
              <div className="field">
                <label>Base URL</label>
                <input
                  value={editing.baseUrl}
                  onChange={(e) => setEditing({ ...editing, baseUrl: e.target.value })}
                />
              </div>
              <div className="field">
                <label>API Key</label>
                <input
                  type="password"
                  value={editing.apiKey}
                  placeholder={/^•+$/.test(editing.apiKey) ? t("（保持不变）") : "sk-…"}
                  onChange={(e) => setEditing({ ...editing, apiKey: e.target.value })}
                />
              </div>
              <div className="field">
                <label>{t("一句话描述（显示在模型菜单里）")}</label>
                <input
                  value={editing.description ?? ""}
                  placeholder="For complex tasks"
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={!!editing.reasoning}
                  onChange={(e) =>
                    setEditing({ ...editing, reasoning: e.target.checked, effort: e.target.checked ? (editing.effort ?? "medium") : undefined })
                  }
                />
                {t("该模型支持思考强度（Effort）控制")}
              </label>
              <div className="form-actions">
                <button className="btn ghost small" onClick={() => setEditing(null)}>
                  {t("取消")}
                </button>
                <button className="btn primary small" onClick={save}>
                  {t("保存")}
                </button>
              </div>
            </div>
          ) : (
            <button className="btn" onClick={startAdd}>
              {t("＋ 添加模型服务…")}
            </button>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
