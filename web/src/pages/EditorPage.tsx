import { useEffect, useMemo, useRef, useState } from "react";
import { ChatMessage, Meta, streamChat, saveDesignSystem } from "../lib/api";
import { extractArtifact, extractForm, extractProps, extractDesignSystemSpec } from "../lib/artifact";
import { ArtifactVersion, SelectedInfo } from "../lib/types";
import { Project, CommentPin, getProject, saveProject, deleteProject, newProject } from "../lib/projects";
import { ChatPanel } from "../components/ChatPanel";
import { Canvas, CanvasHandle } from "../components/Canvas";
import { CommentPopover } from "../components/CommentPopover";
import { SharePopover } from "../components/SharePopover";
import { TweaksPanel, TweaksAsk } from "../components/TweaksPanel";
import { QuestionFormView } from "../components/QuestionFormView";
import { CommentsPanel } from "../components/CommentsPanel";
import { EditPanel } from "../components/EditPanel";
import { EditTool } from "../components/EditToolbar";
import { PresentOverlay } from "../components/PresentOverlay";
import { SkillsModal } from "../components/SkillsModal";
import { SkillEntry } from "../lib/skillCatalog";
import {
  AppBadge,
  ChevronDown,
  PanelLeft,
  HistoryIcon,
  RefreshIcon,
  PencilIcon,
  CopyIcon,
  TrashIcon,
  ChevronRight,
} from "../components/icons";

type CanvasTool = null | "annotate" | "edit" | "tweaks";

interface Props {
  projectId: string;
  meta: Meta | null;
  onMetaChanged: () => void;
  onOpenSettings: () => void;
}

export function EditorPage({ projectId, meta, onMetaChanged, onOpenSettings }: Props) {
  const [proj, setProj] = useState<Project | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [activeSkill, setActiveSkill] = useState<SkillEntry | null>(null);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [selected, setSelected] = useState<SelectedInfo | null>(null);
  const [tool, setTool] = useState<CanvasTool>(null);
  const [editTool, setEditTool] = useState<EditTool>("select");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [presentMenu, setPresentMenu] = useState(false);
  const [presenting, setPresenting] = useState<null | "tab" | "fullscreen">(null);
  const [editDraft, setEditDraft] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [projMenu, setProjMenu] = useState(false);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);

  const canvasRef = useRef<CanvasHandle>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const bufRef = useRef("");
  const seededRef = useRef(false);
  const lastSnapRef = useRef(0);

  const hasProvider = !!(meta && meta.activeProviderId);

  useEffect(() => () => abortRef.current?.(), []);

  useEffect(() => {
    let stale = false;
    setProj(null);
    setTool(null);
    setSelected(null);
    seededRef.current = false;
    getProject(projectId).then((p) => {
      if (stale) return;
      if (!p) {
        location.hash = "#/";
        return;
      }
      setProj((prev) => prev ?? p);
    });
    return () => {
      stale = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!proj) return;
    const t = setTimeout(() => saveProject(proj), 500);
    return () => clearTimeout(t);
  }, [proj]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const patch = (p: Partial<Project>) => setProj((prev) => (prev ? { ...prev, ...p } : prev));

  const messages = proj?.messages ?? [];
  const artifacts = proj?.artifacts ?? [];
  const activeVersionId = proj?.activeVersionId ?? null;

  const lastAssistant =
    messages.length && messages[messages.length - 1].role === "assistant"
      ? messages[messages.length - 1].content
      : "";
  const liveArtifact = streaming ? extractArtifact(lastAssistant) : null;
  const activeVersion = artifacts.find((a) => a.id === activeVersionId) ?? null;
  const canvasHtml = liveArtifact ?? editDraft ?? activeVersion?.html ?? null;
  const awaitingArtifact = streaming && !canvasHtml;
  const activeIdx = artifacts.findIndex((a) => a.id === activeVersionId);
  const fileName = activeVersion ? `${(proj?.name || "Design").slice(0, 14)} · v${activeIdx + 1}` : "No file open";

  const pendingForm = !streaming && messages.length > 0 ? extractForm(lastAssistant) : null;
  const tweakGroups = canvasHtml ? extractProps(canvasHtml) : null;

  useEffect(() => {
    if (!proj) return;
    document.title = `${streaming ? "✶ " : "✓ "}${proj.name}`;
    return () => {
      document.title = "Vibedesign";
    };
  }, [streaming, proj?.name]);

  // ---- Chat turn ----------------------------------------------------------
  const runTurn = (sendMessages: ChatMessage[]) => {
    setStreaming(true);
    setError(null);
    setSelected(null);
    bufRef.current = "";
    setProj((prev) => (prev ? { ...prev, messages: [...sendMessages, { role: "assistant", content: "" }] } : prev));

    abortRef.current = streamChat(
      {
        messages: sendMessages,
        providerId: meta?.activeProviderId,
        skillId: activeSkill?.skillId ?? null,
        extraInstruction: activeSkill?.extraInstruction ?? null,
        designSystemId: proj?.designSystemId,
      },
      {
        onText: (delta) => {
          bufRef.current += delta;
          const buf = bufRef.current;
          setProj((prev) => {
            if (!prev) return prev;
            const msgs = prev.messages.slice();
            if (msgs.length && msgs[msgs.length - 1].role === "assistant") {
              msgs[msgs.length - 1] = { role: "assistant", content: buf };
            } else {
              msgs.push({ role: "assistant", content: buf });
            }
            return { ...prev, messages: msgs };
          });
        },
        onError: (msg) => setError(msg),
        onDone: () => {
          setStreaming(false);
          const buf = bufRef.current;
          const art = extractArtifact(buf);
          if (art) {
            const v: ArtifactVersion = { id: crypto.randomUUID(), html: art, label: labelFrom(buf), createdAt: Date.now() };
            setProj((prev) => (prev ? { ...prev, artifacts: [...prev.artifacts, v], activeVersionId: v.id } : prev));
            setEditDraft(null);
            setDirty(false);
          }
          // DS setup flow: persist the spec block as a reusable design system.
          const dsSpec = extractDesignSystemSpec(buf);
          if (dsSpec) {
            setProj((prev) => {
              if (prev) {
                const dsName = prev.name.replace(/\s*·\s*Design System$/i, "") || "Design system";
                void saveDesignSystem({ id: crypto.randomUUID().slice(0, 8), name: dsName, content: dsSpec, updatedAt: 0 }).then(
                  () => setToast(`Design system「${dsName}」已保存，可在首页选用`),
                );
              }
              return prev;
            });
          }
          setActiveSkill(null);
        },
      },
    );
  };

  useEffect(() => {
    if (!proj || seededRef.current || !meta) return;
    const raw = sessionStorage.getItem(`vd_seed_${projectId}`);
    if (raw && proj.messages.length === 0 && hasProvider) {
      seededRef.current = true;
      sessionStorage.removeItem(`vd_seed_${projectId}`);
      let text = raw;
      let images: string[] | undefined;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.text === "string") {
          text = parsed.text;
          images = parsed.images;
        }
      } catch {
        /* legacy */
      }
      runTurn([{ role: "user", content: text, ...(images?.length ? { images } : {}) }]);
    }
  }, [proj, meta]);

  const handleSend = async (text: string, images?: string[]) => {
    if (streaming || !hasProvider || !proj) return;
    let content = text;
    if (dirty && canvasRef.current) {
      const html = await canvasRef.current.serialize();
      content = `${text}\n\n（这是我在画布上手动微调后的当前设计，请在此基础上修改并重新输出完整文档）\n\n\`\`\`html\n${html}\n\`\`\``;
      setDirty(false);
    }
    runTurn([...messages, { role: "user", content, ...(images?.length ? { images } : {}) }]);
  };

  const stop = () => {
    abortRef.current?.();
    setStreaming(false);
  };

  // ---- Undo / redo ---------------------------------------------------------
  const snapshot = async () => {
    const now = Date.now();
    if (now - lastSnapRef.current < 700) return; // throttle bursts (slider drags)
    lastSnapRef.current = now;
    const html = await canvasRef.current?.serialize();
    if (html) {
      setUndoStack((s) => [...s.slice(-29), html]);
      setRedoStack([]);
    }
  };

  const undo = async () => {
    if (!undoStack.length) return;
    const cur = await canvasRef.current?.serialize();
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    if (cur) setRedoStack((s) => [...s, cur]);
    setEditDraft(prev);
    setDirty(true);
    setReloadNonce((n) => n + 1);
    setSelected(null);
  };

  const redo = async () => {
    if (!redoStack.length) return;
    const cur = await canvasRef.current?.serialize();
    const next = redoStack[redoStack.length - 1];
    setRedoStack((s) => s.slice(0, -1));
    if (cur) setUndoStack((s) => [...s, cur]);
    setEditDraft(next);
    setDirty(true);
    setReloadNonce((n) => n + 1);
    setSelected(null);
  };

  // ---- Refinement ----------------------------------------------------------
  const applyStyle = (prop: string, value: string) => {
    void snapshot();
    canvasRef.current?.postCmd({ __vd_cmd: "applyStyle", prop, value });
    setDirty(true);
  };
  const applyText = (value: string) => {
    void snapshot();
    canvasRef.current?.postCmd({ __vd_cmd: "applyText", value });
    setDirty(true);
  };
  const setAttr = (name: string, value: string | null) => {
    void snapshot();
    canvasRef.current?.postCmd({ __vd_cmd: "setAttr", name, value });
    setDirty(true);
  };
  const saveVersion = async () => {
    if (!canvasRef.current || !proj) return;
    const html = await canvasRef.current.serialize();
    const v: ArtifactVersion = { id: crypto.randomUUID(), html, label: "手动微调", createdAt: Date.now() };
    patch({ artifacts: [...artifacts, v], activeVersionId: v.id });
    setEditDraft(null);
    setDirty(false);
    setToast("已存为新版本");
  };

  const discardEdit = () => {
    setEditDraft(null);
    setDirty(false);
    setSelected(null);
    setUndoStack([]);
    setRedoStack([]);
    setReloadNonce((n) => n + 1);
    setTool(null);
  };
  const applyCode = (html: string) => {
    void snapshot();
    setEditDraft(html);
    setDirty(true);
    setSelected(null);
  };
  const selectByPath = (path: string) => canvasRef.current?.postCmd({ __vd_cmd: "selectByPath", path });

  const askTweaks = async (description: string) => {
    if (!canvasRef.current) return;
    setTool(null);
    const html = await canvasRef.current.serialize();
    const content =
      `为当前设计添加可调 Tweaks 控件（按 data-vd-props 协议声明；值只通过带 fallback 的 CSS 自定义属性生效；保留已有 props）：${description}` +
      `\n\n（这是当前设计的完整 HTML，请在此基础上修改并重新输出完整文档）\n\n\`\`\`html\n${html}\n\`\`\``;
    setDirty(false);
    runTurn([...messages, { role: "user", content }]);
  };

  const setTweakVar = (name: string, value: string, raw: number | string) => {
    canvasRef.current?.postCmd({ __vd_cmd: "setVar", name, value, raw });
    setDirty(true);
  };

  const submitFormAnswers = (answersText: string) => runTurn([...messages, { role: "user", content: answersText }]);

  // ---- Comments -------------------------------------------------------------
  const comments = proj?.comments ?? [];
  const resolveComment = (id: string) => patch({ comments: comments.map((c) => (c.id === id ? { ...c, resolved: true } : c)) });
  const deleteComment = (id: string) => patch({ comments: comments.filter((c) => c.id !== id) });
  const addGlobalComment = (text: string) =>
    patch({ comments: [...comments, { id: crypto.randomUUID(), path: "", text, resolved: false, createdAt: Date.now() }] });
  const sendAllComments = async () => {
    const open = comments.filter((c) => !c.resolved);
    if (!open.length || !canvasRef.current) return;
    const html = await canvasRef.current.serialize();
    const list = open.map((c, i) => `${i + 1}. ${c.path ? `元素 \`${c.path}\`：` : ""}${c.text}`).join("\n");
    const content = `请处理以下画布评论：\n${list}\n\n（这是当前设计的完整 HTML，请在此基础上精确修改并重新输出完整文档）\n\n\`\`\`html\n${html}\n\`\`\``;
    patch({ comments: comments.map((c) => ({ ...c, resolved: true })) });
    setTool(null);
    runTurn([...messages, { role: "user", content }]);
  };

  const sendTargeted = async (instruction: string, pin?: CommentPin, images?: string[]) => {
    if (!canvasRef.current || !proj) return;
    const html = await canvasRef.current.serialize();
    const where = selected ? `选中元素：\`${selected.path}\`（<${selected.tag}>，文本："${selected.text.slice(0, 80)}"）\n` : "";
    const content = `${where}要求：${instruction}\n\n（这是当前设计的完整 HTML，请在此基础上精确修改并重新输出完整文档）\n\n\`\`\`html\n${html}\n\`\`\``;
    if (pin) patch({ comments: [...(proj.comments ?? []), pin] });
    setDirty(false);
    clearSelection();
    runTurn([...messages, { role: "user", content, ...(images?.length ? { images } : {}) }]);
  };

  const addCommentOnly = (text: string) => {
    if (!selected || !proj) return;
    patch({
      comments: [...comments, { id: crypto.randomUUID(), path: selected.path, text, resolved: false, createdAt: Date.now() }],
    });
    clearSelection();
  };
  const submitCommentToClaude = (text: string, images?: string[]) => {
    if (!selected) return;
    const pin: CommentPin = { id: crypto.randomUUID(), path: selected.path, text, resolved: false, createdAt: Date.now() };
    sendTargeted(text, pin, images);
  };

  const clearSelection = () => {
    canvasRef.current?.postCmd({ __vd_cmd: "clear" });
    setSelected(null);
  };

  const switchTool = (t: CanvasTool) => {
    setTool((cur) => (cur === t ? null : t));
    setEditTool("select");
    canvasRef.current?.postCmd({ __vd_cmd: "drawMode", tool: null });
    clearSelection();
  };

  // Draw tools: forward the active tool to the bridge; shapes land in the DOM.
  const changeEditTool = (t: EditTool) => {
    setEditTool(t);
    const isDraw = t !== "select" && t !== "interact";
    canvasRef.current?.postCmd({ __vd_cmd: "drawMode", tool: isDraw ? t : null });
    if (t === "select") canvasRef.current?.postCmd({ __vd_cmd: "enable", value: true });
    if (t === "interact") canvasRef.current?.postCmd({ __vd_cmd: "enable", value: false });
  };

  const onDrawn = () => {
    setDirty(true);
    void snapshot();
    // one shape per activation, then back to select (Figma-like)
    changeEditTool("select");
  };

  // window.claude.complete from prototypes → non-streaming completion.
  const onClaudeRequest = (reqId: number, prompt: string) => {
    let acc = "";
    streamChat(
      { messages: [{ role: "user", content: prompt }], providerId: meta?.activeProviderId },
      {
        onText: (d) => (acc += d),
        onError: (msg) => canvasRef.current?.postCmd({ __vd_cmd: "claudeResult", reqId, error: msg }),
        onDone: () => canvasRef.current?.postCmd({ __vd_cmd: "claudeResult", reqId, text: acc }),
      },
    );
  };

  // ---- Project ops -----------------------------------------------------------
  const duplicateProject = async () => {
    if (!proj) return;
    const copy = { ...proj, ...newProject(`${proj.name} 副本`) , messages: proj.messages, artifacts: proj.artifacts, comments: proj.comments, designSystemId: proj.designSystemId };
    await saveProject(copy);
    setProjMenu(false);
    location.hash = `#/p/${copy.id}`;
  };
  const removeProject = async () => {
    if (!proj) return;
    if (!confirm(`删除项目「${proj.name}」？此操作不可撤销。`)) return;
    await deleteProject(proj.id);
    location.hash = "#/";
  };

  const openInNewTab = () => {
    if (!canvasHtml) return;
    const blob = new Blob([canvasHtml], { type: "text/html" });
    window.open(URL.createObjectURL(blob), "_blank");
  };

  const frameOffset = useMemo(() => {
    const stage = stageRef.current?.querySelector(".canvas-frame") as HTMLElement | null;
    const wrap = stageRef.current;
    if (!stage || !wrap) return { left: 0, top: 0 };
    const a = stage.getBoundingClientRect();
    const b = wrap.getBoundingClientRect();
    return { left: a.left - b.left, top: a.top - b.top };
  }, [selected]);

  if (!proj) return null;

  const refineActive = (tool === "annotate" || tool === "edit") && editTool === "select" && !streaming;

  return (
    <div className={`app ${collapsed ? "collapsed" : ""}`}>
      <aside className="sidebar">
        {/* Fixed sidebar header (user req #5) — survives Edit/Annotate panels */}
        <div className="side-head">
          <AppBadge title="回到首页" onClick={() => (location.hash = "#/")} />
          <input className="pname" value={proj.name} onChange={(e) => patch({ name: e.target.value })} spellCheck={false} />
          <div style={{ position: "relative" }}>
            <button className="iconbtn" title="项目操作" onClick={() => setProjMenu((v) => !v)}>
              <ChevronDown size={14} />
            </button>
            {projMenu && (
              <div className="mini-menu">
                <button
                  onClick={() => {
                    setProjMenu(false);
                    (document.querySelector(".side-head .pname") as HTMLInputElement)?.focus();
                  }}
                >
                  <PencilIcon size={14} /> Rename
                </button>
                <button onClick={duplicateProject}>
                  <CopyIcon size={14} /> Duplicate
                </button>
                <button className="danger" onClick={removeProject}>
                  <TrashIcon size={14} /> Delete project
                </button>
              </div>
            )}
          </div>
          <button className="iconbtn" title="隐藏侧边栏" onClick={() => setCollapsed(true)}>
            <PanelLeft size={15} />
          </button>
          <div style={{ position: "relative" }}>
            <button className="iconbtn" title="聊天历史" onClick={() => setHistoryOpen((v) => !v)}>
              <HistoryIcon size={15} />
            </button>
            {historyOpen && (
              <div className="mini-menu wide">
                {messages.filter((m) => m.role === "user").length === 0 && (
                  <span className="muted small" style={{ padding: "6px 10px" }}>
                    暂无历史
                  </span>
                )}
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <button
                      key={i}
                      onClick={() => {
                        setHistoryOpen(false);
                        setTool(null);
                        setTimeout(() => document.getElementById(`msg-${i}`)?.scrollIntoView({ behavior: "smooth" }), 50);
                      }}
                    >
                      {m.content.slice(0, 42)}
                    </button>
                  ) : null,
                )}
              </div>
            )}
          </div>
        </div>

        {tool === "edit" ? (
          <EditPanel
            selected={selected}
            tweakGroups={tweakGroups}
            html={canvasHtml ?? ""}
            editTool={editTool}
            onEditTool={changeEditTool}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            onUndo={undo}
            onRedo={redo}
            onApplyStyle={applyStyle}
            onApplyText={applyText}
            onSetAttr={setAttr}
            onSelectPath={selectByPath}
            getTree={() => canvasRef.current?.getTree() ?? Promise.resolve(null)}
            exportPng={(sel, scale) => canvasRef.current?.exportPng(sel, scale) ?? Promise.resolve(null)}
            onSetVar={setTweakVar}
            onAskTweaks={askTweaks}
            onSave={saveVersion}
            onDiscard={discardEdit}
          />
        ) : tool === "annotate" ? (
          <CommentsPanel
            comments={comments}
            onResolve={resolveComment}
            onDelete={deleteComment}
            onAddGlobal={addGlobalComment}
            onSendAllToClaude={sendAllComments}
            onClose={() => switchTool("annotate")}
          />
        ) : (
          <ChatPanel
            artifactName={fileName}
            messages={messages}
            streaming={streaming}
            meta={meta}
            onMetaChanged={onMetaChanged}
            activeSkill={activeSkill}
            onClearSkill={() => setActiveSkill(null)}
            onOpenSkills={() => setSkillsOpen(true)}
            onOpenDesignSystem={() => (location.hash = "#/?tab=design-systems")}
            onSend={handleSend}
            onStop={stop}
            onOpenSettings={onOpenSettings}
            hasProvider={hasProvider}
          />
        )}
      </aside>

      <div className="canvas-wrap" ref={stageRef}>
        {collapsed && (
          <button className="expand-side iconbtn" title="展开侧边栏" onClick={() => setCollapsed(false)}>
            <ChevronRight size={15} />
          </button>
        )}
        {error && (
          <div className="banner">
            <span>⚠ {error}</span>
            <button className="btn small" onClick={onOpenSettings}>
              打开设置
            </button>
            <button className="btn ghost small" onClick={() => setError(null)}>
              ✕
            </button>
          </div>
        )}

        <div className="canvas-head">
          <button className="iconbtn" title="重新渲染" onClick={() => setReloadNonce((n) => n + 1)}>
            <RefreshIcon size={15} />
          </button>
          {artifacts.length > 1 ? (
            <select
              className="file-pick"
              value={activeVersionId ?? ""}
              onChange={(e) => {
                patch({ activeVersionId: e.target.value });
                setEditDraft(null);
                setDirty(false);
                clearSelection();
              }}
              title="版本"
            >
              {artifacts.map((v, i) => (
                <option key={v.id} value={v.id}>
                  {(proj.name || "Design").slice(0, 14)} · v{i + 1} {v.label ? `(${v.label})` : ""}
                </option>
              ))}
            </select>
          ) : (
            <span className="file-pick" style={{ cursor: "default" }}>
              {fileName}
            </span>
          )}
          <div className="spacer" />
          <span className="zoom">100%</span>
          <button
            className={`tool-toggle ${tool === "annotate" ? "on" : ""}`}
            onClick={() => switchTool("annotate")}
            disabled={!canvasHtml || streaming}
          >
            ◉ Annotate
          </button>
          <button
            className={`tool-toggle ${tool === "tweaks" || tool === "edit" ? "on" : ""}`}
            onClick={() => switchTool("tweaks")}
            disabled={!canvasHtml || streaming}
            title={tweakGroups ? "调节控件" : "描述想调什么，生成控件"}
          >
            ⊞ Tweaks
          </button>
          <button
            className={`tool-toggle ${tool === "edit" ? "on" : ""}`}
            onClick={() => switchTool("edit")}
            disabled={!canvasHtml || streaming}
          >
            ✎ Edit
          </button>
          <div style={{ position: "relative" }}>
            <button className="tool-toggle" onClick={() => setPresentMenu((v) => !v)} disabled={!canvasHtml || streaming}>
              ▶ Present <ChevronDown size={12} />
            </button>
            {presentMenu && (
              <div className="mini-menu" style={{ right: 0 }}>
                <button
                  onClick={() => {
                    setPresentMenu(false);
                    setPresenting("tab");
                  }}
                >
                  In this tab
                </button>
                <button
                  onClick={() => {
                    setPresentMenu(false);
                    setPresenting("fullscreen");
                  }}
                >
                  Fullscreen
                </button>
                <button
                  onClick={() => {
                    setPresentMenu(false);
                    openInNewTab();
                  }}
                >
                  New tab
                </button>
              </div>
            )}
          </div>
          <SharePopover
            artifactHtml={activeVersion?.html ?? null}
            projectName={proj.name}
            exportPng={(sel, scale) => canvasRef.current?.exportPng(sel, scale) ?? Promise.resolve(null)}
          />
          <button className="btn small" onClick={onOpenSettings} title="模型服务（BYOK）">
            Model
          </button>
        </div>

        <div className="canvas-stage">
          {pendingForm ? (
            <QuestionFormView form={pendingForm} onSubmit={submitFormAnswers} />
          ) : (
            <Canvas
              key={reloadNonce}
              ref={canvasRef}
              html={canvasHtml}
              refineMode={refineActive}
              dimmed={tool === "annotate" && !selected}
              streaming={streaming}
              awaitingArtifact={awaitingArtifact}
              onSelected={setSelected}
              onDrawn={onDrawn}
              onClaudeRequest={onClaudeRequest}
            />
          )}
          {tool === "annotate" && !selected && canvasHtml && <div className="mode-pill">Click to comment</div>}
          {toast && <div className="mode-pill" style={{ background: "var(--accent-black)" }}>{toast}</div>}
        </div>

        {tool === "tweaks" &&
          !streaming &&
          (tweakGroups ? (
            <TweaksPanel
              groups={tweakGroups}
              onSetVar={setTweakVar}
              onAskMore={askTweaks}
              onSaveVersion={saveVersion}
              onClose={() => setTool(null)}
            />
          ) : (
            <TweaksAsk onSubmit={askTweaks} onCancel={() => setTool(null)} />
          ))}

        {tool === "annotate" && selected && !streaming && (
          <CommentPopover
            selected={selected}
            frameOffset={frameOffset}
            pinNumber={comments.length + 1}
            onAddComment={addCommentOnly}
            onSendToClaude={submitCommentToClaude}
            onCancel={clearSelection}
          />
        )}
      </div>

      {presenting && canvasHtml && (
        <PresentOverlay
          html={canvasHtml}
          title={proj.name}
          fullscreen={presenting === "fullscreen"}
          onExit={() => setPresenting(null)}
        />
      )}

      {skillsOpen && (
        <SkillsModal
          onClose={() => setSkillsOpen(false)}
          onPick={(entry) => {
            setSkillsOpen(false);
            if (entry.action === "save-pdf") {
              if (canvasHtml) {
                const w = window.open("", "_blank");
                if (w) {
                  w.document.write(canvasHtml);
                  w.document.close();
                  setTimeout(() => w.print(), 400);
                }
              }
              return;
            }
            setActiveSkill(entry);
          }}
        />
      )}
    </div>
  );
}

function labelFrom(text: string): string {
  const m = text.match(/^####\s+(.+)$/m);
  if (m) return m[1].trim().slice(0, 40);
  return "设计";
}
