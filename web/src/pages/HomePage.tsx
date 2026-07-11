import { useEffect, useRef, useState } from "react";
import { t } from "../lib/i18n";
import { Meta, DesignSystem, listDesignSystems, saveDesignSystem, deleteDesignSystem } from "../lib/api";
import { Project, ProjectListItem, listProjects, deleteProject, getProject, newProject, saveProject } from "../lib/projects";
import { filesToDataUrls } from "../components/ChatPanel";
import { ModelPicker } from "../components/ModelPicker";
import { ChangelogButton } from "../components/ChangelogButton";
import { LangToggle } from "../components/LangToggle";
import { CodebaseMenu, CodebaseCtx } from "../components/CodebaseMenu";
import {
  PlusIcon,
  ArrowUp,
  XIcon,
  MoreHorizontal,
  ExternalLink,
  LinkIcon,
  StarIcon,
  CopyIcon,
  PencilIcon,
  TrashIcon,
} from "../components/icons";
import { clampPop } from "../lib/popover";

interface Props {
  meta: Meta | null;
  onMetaChanged: () => void;
  onOpenSettings: () => void;
}

type HomeTab = "projects" | "design-systems" | "templates";

const TEMPLATES: { name: string; art: JSX.Element }[] = [
  {
    name: "Prototype",
    art: (
      <svg viewBox="0 0 64 44" fill="none" stroke="#8a8a96" strokeWidth="2">
        <rect x="4" y="4" width="56" height="36" rx="4" fill="#fff" />
        <line x1="4" y1="12" x2="60" y2="12" />
        <circle cx="9" cy="8" r="1.4" fill="#8a8a96" />
        <circle cx="14" cy="8" r="1.4" fill="#8a8a96" />
        <rect x="10" y="18" width="18" height="3" rx="1.5" fill="#8a8a96" stroke="none" />
        <rect x="10" y="24" width="26" height="3" rx="1.5" fill="#c9c9d4" stroke="none" />
        <rect x="10" y="31" width="14" height="5" rx="2.5" fill="#a9c0a4" stroke="none" />
        <rect x="40" y="18" width="14" height="18" rx="2" fill="#eceadf" stroke="none" />
      </svg>
    ),
  },
  {
    name: "Slides",
    art: (
      <svg viewBox="0 0 64 44" fill="none" stroke="#8a8a96" strokeWidth="2">
        <rect x="12" y="10" width="46" height="30" rx="3" fill="#f3f1e8" />
        <rect x="6" y="4" width="46" height="30" rx="3" fill="#fff" />
        <rect x="12" y="11" width="16" height="3" rx="1.5" fill="#8a8a96" stroke="none" />
        <rect x="12" y="18" width="12" height="2.5" rx="1.25" fill="#c9c9d4" stroke="none" />
        <rect x="32" y="11" width="14" height="14" rx="2" fill="#dcd9ec" stroke="none" />
      </svg>
    ),
  },
  {
    name: "Document",
    art: (
      <svg viewBox="0 0 64 44" fill="none" stroke="#8a8a96" strokeWidth="2">
        <path d="M20 4h18l8 8v28H20z" fill="#fff" />
        <path d="M38 4v8h8" fill="#eceadf" />
        <rect x="25" y="18" width="16" height="2.5" rx="1.25" fill="#8a8a96" stroke="none" />
        <rect x="25" y="24" width="16" height="2.5" rx="1.25" fill="#c9c9d4" stroke="none" />
        <rect x="25" y="30" width="10" height="2.5" rx="1.25" fill="#c9c9d4" stroke="none" />
      </svg>
    ),
  },
  {
    name: "Wireframe",
    art: (
      <svg viewBox="0 0 64 44" fill="none" stroke="#8a8a96" strokeWidth="2">
        <rect x="6" y="4" width="52" height="36" rx="4" fill="#fff" />
        <rect x="12" y="10" width="24" height="14" rx="2" strokeDasharray="4 3" />
        <path d="M12 24l10-9 14 9" strokeDasharray="4 3" />
        <rect x="12" y="28" width="20" height="2.5" rx="1.25" fill="#c9c9d4" stroke="none" />
        <rect x="40" y="28" width="12" height="6" rx="3" strokeDasharray="4 3" />
      </svg>
    ),
  },
  {
    name: "Animation",
    art: (
      <svg viewBox="0 0 64 44" fill="none" stroke="#8a8a96" strokeWidth="2">
        <rect x="6" y="4" width="52" height="28" rx="4" fill="#fff" />
        <circle cx="32" cy="18" r="8" fill="#dcd9ec" stroke="none" />
        <path d="M29 13.5l7 4.5-7 4.5z" fill="#8a8a96" stroke="none" />
        <line x1="10" y1="38" x2="54" y2="38" stroke="#c9c9d4" strokeWidth="3" strokeLinecap="round" />
        <circle cx="26" cy="38" r="3.4" fill="#8a8a96" stroke="none" />
      </svg>
    ),
  },
];

export function HomePage({ meta, onMetaChanged, onOpenSettings }: Props) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [designSystems, setDesignSystems] = useState<DesignSystem[]>([]);
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [codebase, setCodebase] = useState<CodebaseCtx | null>(null);
  const [dsId, setDsId] = useState<string>("");
  const [tab, setTab] = useState<HomeTab>(() =>
    location.hash.includes("tab=design-systems") ? "design-systems" : "projects",
  );
  const [query, setQuery] = useState("");
  const [editingDS, setEditingDS] = useState<DesignSystem | null>(null);
  const [addDSOpen, setAddDSOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    listProjects().then(setProjects);
    listDesignSystems().then(setDesignSystems);
  };
  useEffect(refresh, []);

  useEffect(() => {
    if (rowMenu === null) return;
    const onDoc = () => setRowMenu(null);
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [rowMenu]);

  const create = async (initialPrompt?: string, template?: string) => {
    const name = initialPrompt ? deriveName(initialPrompt) : template ? `${template} project` : "Untitled";
    const p = newProject(name);
    if (dsId) p.designSystemId = dsId;
    await saveProject(p);
    let seedText = initialPrompt ?? (template ? `Start a ${template.toLowerCase()} project.` : null);
    if (seedText && codebase) seedText += codebase.text;
    if (seedText) {
      sessionStorage.setItem(`vd_seed_${p.id}`, JSON.stringify({ text: seedText, images: images.length ? images : undefined }));
    }
    location.hash = `#/p/${p.id}`;
  };

  const duplicate = async (id: string) => {
    const src = await getProject(id);
    if (!src) return;
    const copy: Project = { ...src, ...newProject(`${src.name} ${t("副本")}`), messages: src.messages, artifacts: src.artifacts, comments: src.comments, designSystemId: src.designSystemId };
    await saveProject(copy);
    refresh();
  };

  const rename = async (id: string, name: string) => {
    const p = await getProject(id);
    if (p) {
      p.name = name;
      await saveProject(p);
    }
    setRenaming(null);
    refresh();
  };

  const toggleFavorite = async (id: string) => {
    const p = await getProject(id);
    if (p) {
      p.favorite = !p.favorite;
      await saveProject(p);
    }
    refresh();
  };

  const providers = meta?.providers ?? [];
  const filtered = projects.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="home">
      <header className="home-top">
        <div className="brand">
          <span className="wordmark">Vibedesign</span>
          <span className="beta">{t("Beta")}</span>
        </div>
        <div className="spacer" />
        <LangToggle />
        <ChangelogButton />
        <button className="btn ghost small" onClick={onOpenSettings}>
          {t("模型服务")}
        </button>
      </header>

      <main className="home-main">
        <h1 className="home-title">{t("What will you design today?")}</h1>

        <div className="home-composer">
          {(images.length > 0 || codebase) && (
            <div className="attach-row">
              {codebase && (
                <span className="ctx-chip">
                  {codebase.label}
                  <button onClick={() => setCodebase(null)}><XIcon size={10} /></button>
                </span>
              )}
              {images.map((img, i) => (
                <span key={i} className="attach-chip">
                  <img src={img} alt="" />
                  <button onClick={() => setImages((p) => p.filter((_, j) => j !== i))}><XIcon size={10} /></button>
                </span>
              ))}
            </div>
          )}
          <textarea
            rows={2}
            placeholder={t("Draft a landing page, a prototype, a deck…")}
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
            <button className="iconbtn" title={t("添加图片")} onClick={() => fileRef.current?.click()}>
              <PlusIcon size={16} />
            </button>
            <div className="pill-select" title={t("Design system")}>
              <span className="k">{t("Design system")}</span>
              <select className="v" value={dsId} onChange={(e) => setDsId(e.target.value)}>
                <option value="">{t("None")}</option>
                {designSystems.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="pill-select" title={t("Template")}>
              <span className="k">{t("Template")}</span>
              <span className="v">{t("None")}</span>
            </div>
            <CodebaseMenu current={codebase} onSet={setCodebase} />
            <div className="grow" />
            <div className="pill-select" title="模型（BYOK）">
              <span className="k">{t("Model")}</span>
              <ModelPicker meta={meta} onMetaChanged={onMetaChanged} onOpenSettings={onOpenSettings} align="down" />
            </div>
            <button className="send" disabled={!prompt.trim()} onClick={() => create(prompt.trim())} title={t("开始设计")}>
              <ArrowUp size={17} />
            </button>
          </div>
        </div>

        <div className="template-strip">
          <div className="cap">{t("Start with a template…")}</div>
          <div className="template-cards">
            {TEMPLATES.map((tp) => (
              <button key={tp.name} className="template-card" onClick={() => create(undefined, tp.name)}>
                <div className="mini">{tp.art}</div>
                {t(tp.name)}
              </button>
            ))}
          </div>
          <button className="blank-link" onClick={() => create()}>
            {t("…or start a blank project →")}
          </button>
        </div>

        <div className="home-projects">
          <div className="home-tabs">
            <button className={`home-tab ${tab === "projects" ? "on" : ""}`} onClick={() => setTab("projects")}>
              {t("Projects")}
            </button>
            <button className={`home-tab ${tab === "design-systems" ? "on" : ""}`} onClick={() => setTab("design-systems")}>
              {t("Design systems")}
            </button>
            <button className={`home-tab ${tab === "templates" ? "on" : ""}`} onClick={() => setTab("templates")}>
              {t("Templates")}
            </button>
            <div className="spacer" />
            {tab === "design-systems" && (
              <button className="btn small" onClick={() => setAddDSOpen(true)}>
                {t("Create design system")}
              </button>
            )}
            <input className="search" placeholder={t("Search")} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          {tab === "projects" && (
            <div className="project-rows">
              {filtered.length === 0 && (
                <p className="muted" style={{ padding: "14px 6px", fontSize: 13.5 }}>
                  {t("还没有项目。从上面的输入框开始第一个设计。")}
                </p>
              )}
              {filtered.map((p) => (
                <div key={p.id} className="project-row" onClick={() => renaming !== p.id && (location.hash = `#/p/${p.id}`)}>
                  <span className="thumb" />
                  {renaming === p.id ? (
                    <input
                      autoFocus
                      defaultValue={p.name}
                      className="rename-input"
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => rename(p.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") rename(p.id, (e.target as HTMLInputElement).value);
                        if (e.key === "Escape") setRenaming(null);
                      }}
                    />
                  ) : (
                    <span className="name">
                      {p.favorite && <StarIcon size={13} filled style={{ color: "var(--accent)", marginRight: 5, verticalAlign: -2 }} />}
                      {p.name}
                    </span>
                  )}
                  <span className="time">{timeAgo(p.updatedAt)}</span>
                  <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
                    <button className="iconbtn row-more" onClick={() => setRowMenu(rowMenu === p.id ? null : p.id)}>
                      <MoreHorizontal size={16} />
                    </button>
                    {rowMenu === p.id && (
                      <div className="mini-menu" style={{ right: 0 }} ref={clampPop}>
                        <button onClick={() => window.open(`${location.origin}${location.pathname}#/p/${p.id}`, "_blank")}>
                          <ExternalLink size={14} /> {t("Open in new tab")}
                        </button>
                        <button
                          onClick={async () => {
                            await navigator.clipboard.writeText(`${location.origin}${location.pathname}#/p/${p.id}`);
                            setRowMenu(null);
                          }}
                        >
                          <LinkIcon size={14} /> {t("Copy link")}
                        </button>
                        <button onClick={() => { setRowMenu(null); toggleFavorite(p.id); }}>
                          <StarIcon size={14} filled={p.favorite} /> {p.favorite ? "Remove from favorites" : "Add to favorites"}
                        </button>
                        <button onClick={() => { setRowMenu(null); duplicate(p.id); }}>
                          <CopyIcon size={14} /> {t("Duplicate")}
                        </button>
                        <button onClick={() => { setRowMenu(null); setRenaming(p.id); }}>
                          <PencilIcon size={14} /> {t("Rename")}
                        </button>
                        <div className="pm-sep" />
                        <button
                          className="danger"
                          onClick={async () => {
                            setRowMenu(null);
                            if (confirm(`${t("删除项目")}「${p.name}」？`)) {
                              await deleteProject(p.id);
                              refresh();
                            }
                          }}
                        >
                          <TrashIcon size={14} /> {t("Delete Project")}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "design-systems" && (
            <div className="ds-list">
              {designSystems.map((d) => (
                <div key={d.id} className="ds-card">
                  <div className="ds-head">
                    <span className="name">{d.name}</span>
                    {d.builtin && <span className="ds-builtin-badge">{t("内置")}</span>}
                    <span className="spacer" />
                    {d.builtin ? (
                      <button
                        className="btn ghost small"
                        title={t("复制一份到你的库以便编辑")}
                        onClick={async () => {
                          await saveDesignSystem({
                            id: crypto.randomUUID().slice(0, 8),
                            name: `${d.name} 副本`,
                            content: d.content,
                            tokensCss: d.tokensCss,
                            category: d.category,
                            updatedAt: 0,
                          });
                          refresh();
                        }}
                      >
                        {t("复制为可编辑")}
                      </button>
                    ) : (
                      <>
                        <button className="btn ghost small" onClick={() => setEditingDS({ ...d })}>
                          {t("编辑")}
                        </button>
                        <button
                          className="btn ghost small"
                          onClick={async () => {
                            await deleteDesignSystem(d.id);
                            if (dsId === d.id) setDsId("");
                            refresh();
                          }}
                        >
                          {t("删除")}
                        </button>
                      </>
                    )}
                  </div>
                  <p className="ds-preview">{d.content.slice(0, 160)}</p>
                </div>
              ))}
              {editingDS && (
                <div className="ds-card" style={{ borderColor: "var(--accent)" }}>
                  <input
                    className="ds-name"
                    placeholder={t("名称")}
                    value={editingDS.name}
                    onChange={(e) => setEditingDS({ ...editingDS, name: e.target.value })}
                  />
                  <textarea
                    className="ds-content"
                    rows={7}
                    value={editingDS.content}
                    onChange={(e) => setEditingDS({ ...editingDS, content: e.target.value })}
                  />
                  <div className="form-actions">
                    <button className="btn ghost small" onClick={() => setEditingDS(null)}>
                      {t("取消")}
                    </button>
                    <button
                      className="btn primary small"
                      disabled={!editingDS.name.trim()}
                      onClick={async () => {
                        await saveDesignSystem(editingDS);
                        setEditingDS(null);
                        refresh();
                      }}
                    >
                      {t("保存")}
                    </button>
                  </div>
                </div>
              )}
              {designSystems.length === 0 && !editingDS && (
                <p className="muted" style={{ fontSize: 13.5 }}>
                  {t("Design systems teach Claude your brand.")}
                </p>
              )}
            </div>
          )}

          {tab === "templates" && (
            <div className="project-rows">
              {TEMPLATES.map((tp) => (
                <div key={tp.name} className="project-row" onClick={() => create(undefined, tp.name)}>
                  <span className="thumb" style={{ display: "grid", placeItems: "center", padding: 3 }}>{tp.art}</span>
                  <span className="name">{t(tp.name)}</span>
                  <span className="time">{t("模板")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {addDSOpen && (
        <div className="modal-backdrop" onClick={() => setAddDSOpen(false)}>
          <div className="modal" style={{ width: 560 }} onClick={(e) => e.stopPropagation()}>
            <header>
              <h2>{t("Add a design system")}</h2>
              <button className="iconbtn" onClick={() => setAddDSOpen(false)}>
                <XIcon size={13} />
              </button>
            </header>
            <div className="content">
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                {t("Design systems teach Claude your brand. How would you like to start?")}
              </p>
              <button
                className="ds-option"
                onClick={() => {
                  setAddDSOpen(false);
                  location.hash = "#/ds-setup";
                }}
              >
                <span className="ic blue">⬇</span>
                <span className="tx">
                  <span className="t">{t("Create here")}</span>
                  <span className="d">{t("Connect to GitHub, upload assets, or describe your brand.")}</span>
                </span>
              </button>
              <button className="ds-option" disabled title={t("以后拓展")}>
                <span className="ic green">⌨</span>
                <span className="tx">
                  <span className="t">
                    {t("Create using Claude Code")} <span className="badge-fidelity">BEST FIDELITY</span>
                  </span>
                  <span className="d">{t("Best fidelity if you have React components.（即将支持）")}</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function deriveName(prompt: string): string {
  return prompt.slice(0, 28) + (prompt.length > 28 ? "…" : "");
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return t("刚刚");
  if (s < 3600) return `${Math.floor(s / 60)} ${t("分钟前")}`;
  if (s < 86400) return `${Math.floor(s / 3600)} ${t("小时前")}`;
  return `${Math.floor(s / 86400)} ${t("天前")}`;
}
