import { useEffect, useMemo, useRef, useState } from "react";
import { ChatMessage, Meta, streamChat } from "../lib/api";
import { extractArtifact, extractForm, extractProps } from "../lib/artifact";
import { ArtifactVersion, SelectedInfo, SelectedStyles } from "../lib/types";
import { Project, CommentPin, getProject, saveProject } from "../lib/projects";
import { ChatPanel } from "../components/ChatPanel";
import { Canvas, CanvasHandle } from "../components/Canvas";
import { CommentPopover } from "../components/CommentPopover";
import { SharePopover } from "../components/SharePopover";
import { TweaksPanel, TweaksAsk } from "../components/TweaksPanel";
import { QuestionFormView } from "../components/QuestionFormView";
import { CommentsPanel } from "../components/CommentsPanel";
import { EditPanel } from "../components/EditPanel";
import { PresentOverlay } from "../components/PresentOverlay";

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
  const [activeSkill, setActiveSkill] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedInfo | null>(null);
  const [tool, setTool] = useState<CanvasTool>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [editDraft, setEditDraft] = useState<string | null>(null); // Code tab preview
  const [reloadNonce, setReloadNonce] = useState(0); // bump to force iframe re-render

  const canvasRef = useRef<CanvasHandle>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const bufRef = useRef("");
  const seededRef = useRef(false);

  const hasProvider = !!(meta && meta.activeProviderId);

  // Abort any in-flight stream when the editor unmounts (project switch etc.).
  useEffect(() => () => abortRef.current?.(), []);

  useEffect(() => {
    // GOTCHA: StrictMode 下本 effect 双跑，晚返回的旧数据会覆盖 runTurn 已写入的
    // 消息。先清空再加载：prev ?? p 只吞“同一项目加载期间”的竞态，切换项目时
    // setProj(null) 保证新数据一定落地。
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

  // Clarifying-question form: rendered in the canvas while it's the latest
  // assistant output and hasn't been answered yet (field study §4).
  const pendingForm = !streaming && messages.length > 0 ? extractForm(lastAssistant) : null;
  // Tweaks props declared in the current artifact (field study §7).
  const tweakGroups = canvasHtml ? extractProps(canvasHtml) : null;

  // Browser tab title = status indicator (field study §1).
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
    setProj((prev) =>
      prev ? { ...prev, messages: [...sendMessages, { role: "assistant", content: "" }] } : prev,
    );

    abortRef.current = streamChat(
      {
        messages: sendMessages,
        providerId: meta?.activeProviderId,
        skillId: activeSkill,
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
            const v: ArtifactVersion = {
              id: crypto.randomUUID(),
              html: art,
              label: labelFrom(buf),
              createdAt: Date.now(),
            };
            setProj((prev) =>
              prev ? { ...prev, artifacts: [...prev.artifacts, v], activeVersionId: v.id } : prev,
            );
            setDirty(false);
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
        /* legacy plain-text seed */
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

  // ---- Refinement ---------------------------------------------------------
  const applyStyle = (prop: keyof SelectedStyles | string, value: string) => {
    canvasRef.current?.postCmd({ __vd_cmd: "applyStyle", prop, value });
    setDirty(true);
  };
  const applyText = (value: string) => {
    canvasRef.current?.postCmd({ __vd_cmd: "applyText", value });
    setDirty(true);
  };
  const saveVersion = async () => {
    if (!canvasRef.current || !proj) return;
    const html = await canvasRef.current.serialize();
    const v: ArtifactVersion = { id: crypto.randomUUID(), html, label: "手动微调", createdAt: Date.now() };
    patch({ artifacts: [...artifacts, v], activeVersionId: v.id });
    setEditDraft(null);
    setDirty(false);
  };

  // ---- Edit mode (field study §8) -------------------------------------------
  const discardEdit = () => {
    setEditDraft(null);
    setDirty(false);
    clearSelection();
    setReloadNonce((n) => n + 1); // re-render the pristine version
    setTool(null);
  };
  const applyCode = (html: string) => {
    setEditDraft(html);
    setDirty(true);
    clearSelection();
  };
  const selectByPath = (path: string) => {
    canvasRef.current?.postCmd({ __vd_cmd: "selectByPath", path });
  };

  const sendTargeted = async (instruction: string, pin?: CommentPin) => {
    if (!canvasRef.current || !proj) return;
    const html = await canvasRef.current.serialize();
    const where = selected
      ? `选中元素：\`${selected.path}\`（<${selected.tag}>，文本："${selected.text.slice(0, 80)}"）\n`
      : "";
    const content = `${where}要求：${instruction}\n\n（这是当前设计的完整 HTML，请在此基础上精确修改并重新输出完整文档）\n\n\`\`\`html\n${html}\n\`\`\``;
    if (pin) patch({ comments: [...(proj.comments ?? []), pin] });
    setDirty(false);
    clearSelection();
    runTurn([...messages, { role: "user", content }]);
  };

  const addCommentOnly = (text: string) => {
    if (!selected || !proj) return;
    const pin: CommentPin = {
      id: crypto.randomUUID(),
      path: selected.path,
      text,
      resolved: false,
      createdAt: Date.now(),
    };
    patch({ comments: [...(proj.comments ?? []), pin] });
    clearSelection();
  };

  const submitCommentToClaude = (text: string) => {
    if (!selected) return;
    const pin: CommentPin = {
      id: crypto.randomUUID(),
      path: selected.path,
      text,
      resolved: false,
      createdAt: Date.now(),
    };
    sendTargeted(text, pin);
  };

  const clearSelection = () => {
    canvasRef.current?.postCmd({ __vd_cmd: "clear" });
    setSelected(null);
  };

  const switchTool = (t: CanvasTool) => {
    setTool((cur) => (cur === t ? null : t));
    clearSelection();
  };

  // ---- Tweaks (field study §7) --------------------------------------------
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

  // ---- Clarifying form (field study §4) ------------------------------------
  const submitFormAnswers = (answersText: string) => {
    runTurn([...messages, { role: "user", content: answersText }]);
  };

  // ---- Comments panel (field study §6) --------------------------------------
  const comments = proj?.comments ?? [];
  const resolveComment = (id: string) =>
    patch({ comments: comments.map((c) => (c.id === id ? { ...c, resolved: true } : c)) });
  const deleteComment = (id: string) => patch({ comments: comments.filter((c) => c.id !== id) });
  const addGlobalComment = (text: string) =>
    patch({
      comments: [...comments, { id: crypto.randomUUID(), path: "", text, resolved: false, createdAt: Date.now() }],
    });
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

  const frameOffset = useMemo(() => {
    const stage = stageRef.current?.querySelector(".canvas-frame") as HTMLElement | null;
    const wrap = stageRef.current;
    if (!stage || !wrap) return { left: 0, top: 0 };
    const a = stage.getBoundingClientRect();
    const b = wrap.getBoundingClientRect();
    return { left: a.left - b.left, top: a.top - b.top };
  }, [selected]);

  if (!proj) return null;

  return (
    <div className="app">
      {tool === "edit" ? (
        <EditPanel
          selected={selected}
          tweakGroups={tweakGroups}
          html={canvasHtml ?? ""}
          onApplyStyle={applyStyle}
          onApplyText={applyText}
          onSelectPath={selectByPath}
          getTree={() => canvasRef.current?.getTree() ?? Promise.resolve(null)}
          onApplyCode={applyCode}
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
          projectName={proj.name}
          onRename={(n) => patch({ name: n })}
          artifactName={fileName}
          messages={messages}
          streaming={streaming}
          meta={meta}
          onMetaChanged={onMetaChanged}
          skills={meta?.skills ?? []}
          activeSkill={activeSkill}
          setActiveSkill={setActiveSkill}
          onSend={handleSend}
          onStop={stop}
          onOpenSettings={onOpenSettings}
          hasProvider={hasProvider}
        />
      )}

      <div className="canvas-wrap" ref={stageRef}>
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
          <button className="iconbtn" title="重新渲染" onClick={() => patch({})}>
            ↻
          </button>
          {artifacts.length > 1 ? (
            <select
              className="file-pick"
              value={activeVersionId ?? ""}
              onChange={(e) => {
                patch({ activeVersionId: e.target.value });
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
            className={`tool-toggle ${tool === "tweaks" ? "on" : ""}`}
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
          <button
            className="tool-toggle"
            onClick={() => setPresenting(true)}
            disabled={!canvasHtml || streaming}
            title="全屏演示"
          >
            ▶ Present
          </button>
          <SharePopover artifactHtml={activeVersion?.html ?? null} projectName={proj.name} />
          <button className="iconbtn" onClick={onOpenSettings} title="模型服务（BYOK）">
            ⚙
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
              refineMode={(tool === "annotate" || tool === "edit") && !streaming}
              dimmed={tool === "annotate" && !selected}
              streaming={streaming}
              awaitingArtifact={awaitingArtifact}
              onSelected={setSelected}
            />
          )}
          {tool === "annotate" && !selected && canvasHtml && (
            <div className="mode-pill">Click to comment</div>
          )}
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
            pinNumber={(proj.comments?.length ?? 0) + 1}
            onAddComment={addCommentOnly}
            onSendToClaude={submitCommentToClaude}
            onCancel={clearSelection}
          />
        )}
      </div>

      {presenting && canvasHtml && (
        <PresentOverlay html={canvasHtml} title={proj.name} onExit={() => setPresenting(false)} />
      )}
    </div>
  );
}

function labelFrom(text: string): string {
  const m = text.match(/^####\s+(.+)$/m);
  if (m) return m[1].trim().slice(0, 40);
  return "设计";
}
