import { useEffect, useRef, useState } from "react";
import {
  Meta,
  DesignSystem,
  setActiveProvider,
  listDesignSystems,
  saveDesignSystem,
  deleteDesignSystem,
} from "../lib/api";
import { ProjectListItem, listProjects, deleteProject, newProject, saveProject } from "../lib/projects";
import { filesToDataUrls } from "../components/ChatPanel";

interface Props {
  meta: Meta | null;
  onMetaChanged: () => void;
  onOpenSettings: () => void;
}

const TEMPLATES = ["Prototype", "Slides", "Document", "Wireframe", "Animation"] as const;
type HomeTab = "projects" | "design-systems" | "templates";

// Home replicating field study §10.
export function HomePage({ meta, onMetaChanged, onOpenSettings }: Props) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [designSystems, setDesignSystems] = useState<DesignSystem[]>([]);
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [dsId, setDsId] = useState<string>("");
  const [tab, setTab] = useState<HomeTab>("projects");
  const [query, setQuery] = useState("");
  const [editingDS, setEditingDS] = useState<DesignSystem | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    listProjects().then(setProjects);
    listDesignSystems().then(setDesignSystems);
  };
  useEffect(refresh, []);

  const create = async (initialPrompt?: string, template?: string) => {
    const name = initialPrompt ? deriveName(initialPrompt) : template ? `${template} project` : "Untitled";
    const p = newProject(name);
    if (dsId) p.designSystemId = dsId;
    await saveProject(p);
    const seedText = initialPrompt ?? (template ? `Start a ${template.toLowerCase()} project.` : null);
    if (seedText) {
      sessionStorage.setItem(
        `vd_seed_${p.id}`,
        JSON.stringify({ text: seedText, images: images.length ? images : undefined }),
      );
    }
    location.hash = `#/p/${p.id}`;
  };

  const remove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteProject(id);
    refresh();
  };

  const providers = meta?.providers ?? [];
  const activeProviderId = meta?.activeProviderId ?? "";
  const filtered = projects.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="home">
      <header className="home-top">
        <div className="brand">
          <span className="wordmark">Vibedesign</span>
          <span className="beta">Beta</span>
        </div>
        <div className="spacer" />
        <button className="btn ghost small" onClick={onOpenSettings}>
          模型服务
        </button>
      </header>

      <main className="home-main">
        <h1 className="home-title">What will you design today?</h1>

        <div className="home-composer">
          {images.length > 0 && (
            <div className="attach-row">
              {images.map((img, i) => (
                <span key={i} className="attach-chip">
                  <img src={img} alt="" />
                  <button onClick={() => setImages((p) => p.filter((_, j) => j !== i))}>✕</button>
                </span>
              ))}
            </div>
          )}
          <textarea
            rows={2}
            placeholder="Draft a landing page, a prototype, a deck…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (prompt.trim()) create(prompt.trim());
              }
            }}
          />
          <div className="toolrow">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={async (e) => {
                if (e.target.files?.length) {
                  const urls = await filesToDataUrls(e.target.files);
                  setImages((p) => [...p, ...urls].slice(0, 4));
                }
                e.target.value = "";
              }}
            />
            <button className="iconbtn" title="添加图片（截图/参考图）" onClick={() => fileRef.current?.click()}>
              ＋
            </button>
            <div className="pill-select" title="Design system">
              <span className="k">Design system</span>
              <select className="v" value={dsId} onChange={(e) => setDsId(e.target.value)}>
                <option value="">None</option>
                {designSystems.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="pill-select" title="Template">
              <span className="k">Template</span>
              <span className="v">None</span>
            </div>
            <div className="grow" />
            <div className="pill-select" title="模型（BYOK）">
              <span className="k">Model</span>
              <select
                className="v"
                value={activeProviderId}
                onChange={async (e) => {
                  if (e.target.value === "__add__") {
                    onOpenSettings();
                    return;
                  }
                  await setActiveProvider(e.target.value);
                  onMetaChanged();
                }}
              >
                {providers.length === 0 && <option value="">未配置</option>}
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value="__add__">＋ 添加模型服务…</option>
              </select>
            </div>
            <button className="send" disabled={!prompt.trim()} onClick={() => create(prompt.trim())} title="开始设计">
              ↑
            </button>
          </div>
        </div>

        <div className="template-strip">
          <div className="cap">Start with a template…</div>
          <div className="template-cards">
            {TEMPLATES.map((t) => (
              <button key={t} className="template-card" onClick={() => create(undefined, t)}>
                <div className="mini" />
                {t}
              </button>
            ))}
          </div>
          <button className="blank-link" onClick={() => create()}>
            …or start a blank project →
          </button>
        </div>

        <div className="home-projects">
          <div className="home-tabs">
            <button className={`home-tab ${tab === "projects" ? "on" : ""}`} onClick={() => setTab("projects")}>
              Projects
            </button>
            <button
              className={`home-tab ${tab === "design-systems" ? "on" : ""}`}
              onClick={() => setTab("design-systems")}
            >
              Design systems
            </button>
            <button className={`home-tab ${tab === "templates" ? "on" : ""}`} onClick={() => setTab("templates")}>
              Templates
            </button>
            <div className="spacer" />
            <input className="search" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          {tab === "projects" && (
            <div className="project-rows">
              {filtered.length === 0 && (
                <p className="muted small" style={{ padding: "14px 6px" }}>
                  还没有项目。从上面的输入框开始第一个设计。
                </p>
              )}
              {filtered.map((p) => (
                <button key={p.id} className="project-row" onClick={() => (location.hash = `#/p/${p.id}`)}>
                  <span className="thumb" />
                  <span className="name">{p.name}</span>
                  <span className="time">{timeAgo(p.updatedAt)}</span>
                  <span className="del" onClick={(e) => remove(p.id, e as unknown as React.MouseEvent)}>
                    ✕
                  </span>
                </button>
              ))}
            </div>
          )}

          {tab === "design-systems" && (
            <div className="ds-list">
              {designSystems.map((d) => (
                <div key={d.id} className="ds-card">
                  <div className="ds-head">
                    <span className="name">{d.name}</span>
                    <span className="spacer" />
                    <button className="btn ghost small" onClick={() => setEditingDS({ ...d })}>
                      编辑
                    </button>
                    <button
                      className="btn ghost small"
                      onClick={async () => {
                        await deleteDesignSystem(d.id);
                        if (dsId === d.id) setDsId("");
                        refresh();
                      }}
                    >
                      删除
                    </button>
                  </div>
                  <p className="ds-preview">{d.content.slice(0, 160)}</p>
                </div>
              ))}
              {editingDS ? (
                <div className="ds-card" style={{ borderColor: "var(--accent)" }}>
                  <input
                    className="ds-name"
                    placeholder="名称，如：Acme 品牌"
                    value={editingDS.name}
                    onChange={(e) => setEditingDS({ ...editingDS, name: e.target.value })}
                  />
                  <textarea
                    className="ds-content"
                    rows={7}
                    placeholder={
                      "粘贴品牌/设计系统上下文——颜色 tokens、字体、间距、语气、组件规范…\n例：\n--primary: #0f62fe; 标题用衬线，正文 Inter；语气克制专业；按钮圆角 8px。"
                    }
                    value={editingDS.content}
                    onChange={(e) => setEditingDS({ ...editingDS, content: e.target.value })}
                  />
                  <div className="form-actions">
                    <button className="btn ghost small" onClick={() => setEditingDS(null)}>
                      取消
                    </button>
                    <button
                      className="btn primary small"
                      disabled={!editingDS.name.trim() || !editingDS.content.trim()}
                      onClick={async () => {
                        await saveDesignSystem(editingDS);
                        setEditingDS(null);
                        refresh();
                      }}
                    >
                      保存
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="btn"
                  style={{ alignSelf: "flex-start" }}
                  onClick={() =>
                    setEditingDS({ id: crypto.randomUUID().slice(0, 8), name: "", content: "", updatedAt: 0 })
                  }
                >
                  + 新建 design system
                </button>
              )}
              <p className="muted small" style={{ margin: 0 }}>
                选中的 design system 会注入每次生成，设计将严格使用其中的颜色/字体/组件规范（原版 §8 的最小可用形态；从 codebase 自动提取后续加）。
              </p>
            </div>
          )}

          {tab === "templates" && (
            <p className="muted small" style={{ padding: "14px 6px" }}>
              模板库即将支持。先用上方的模板卡开始。
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function deriveName(prompt: string): string {
  return prompt.slice(0, 28) + (prompt.length > 28 ? "…" : "");
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return `${Math.floor(s / 86400)} 天前`;
}
