import { useEffect, useRef, useState } from "react";
import { ChatMessage, Meta } from "../lib/api";
import { stripArtifact, extractArtifact, extractForm } from "../lib/artifact";
import { renderMarkdown } from "../lib/markdown";
import { AgentSteps } from "./AgentSteps";
import { PlusIcon, ArrowUp, StopIcon, XIcon, ExternalLink } from "./icons";
import { ModelPicker } from "./ModelPicker";
import { PlusMenu, AttachedContext } from "./PlusMenu";
import { SkillEntry } from "../lib/skillCatalog";

interface Props {
  artifactName: string;
  messages: ChatMessage[];
  streaming: boolean;
  meta: Meta | null;
  onMetaChanged: () => void;
  activeSkill: SkillEntry | null;
  onClearSkill: () => void;
  onOpenSkills: () => void;
  onOpenDesignSystem: () => void;
  onSend: (text: string, images?: string[]) => void;
  onStop: () => void;
  onOpenSettings: () => void;
  hasProvider: boolean;
}

const EXAMPLES = ["一个 SaaS 落地页 hero，克制、暖色", "理财 App dashboard 原型", "5 页产品发布 keynote"];

export function filesToDataUrls(files: FileList | File[]): Promise<string[]> {
  return Promise.all(
    Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, 4)
      .map(
        (f) =>
          new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = reject;
            r.readAsDataURL(f);
          }),
      ),
  );
}

function renderUser(content: string) {
  const idx = content.indexOf("```html");
  if (idx === -1) return <div className="bubble">{content}</div>;
  return (
    <>
      <div className="bubble">{content.slice(0, idx).trim()}</div>
      <div className="snapshot">📎 已附上下文快照</div>
    </>
  );
}

export function ChatPanel({
  artifactName,
  messages,
  streaming,
  meta,
  onMetaChanged,
  activeSkill,
  onClearSkill,
  onOpenSkills,
  onOpenDesignSystem,
  onSend,
  onStop,
  onOpenSettings,
  hasProvider,
}: Props) {
  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [contexts, setContexts] = useState<AttachedContext[]>([]);
  const [plusOpen, setPlusOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const autoGrow = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 150) + "px";
  };

  const submit = () => {
    const t = input.trim();
    if ((!t && pendingImages.length === 0 && contexts.length === 0) || streaming) return;
    const ctxText = contexts.map((c) => c.text).join("");
    onSend((t || "（见附件）") + ctxText, pendingImages.length ? pendingImages : undefined);
    setInput("");
    setPendingImages([]);
    setContexts([]);
    requestAnimationFrame(autoGrow);
  };

  return (
    <section className="chat">
      <div className="messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="empty">
            <h2>Describe what you want to create</h2>
            <p>像跟设计师对话一样描述，设计会实时出现在右侧画布。</p>
            <div>
              {EXAMPLES.map((e) => (
                <button key={e} className="chip" onClick={() => onSend(e)} disabled={!hasProvider}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => {
          const isLastAssistant = m.role === "assistant" && i === messages.length - 1;
          if (m.role === "user") {
            return (
              <div key={i} id={`msg-${i}`} className="msg user">
                {(m.images?.length ?? 0) > 0 && (
                  <div className="msg-imgs">
                    {m.images!.map((img, j) => (
                      <img key={j} src={img} alt="" />
                    ))}
                  </div>
                )}
                {renderUser(m.content)}
              </div>
            );
          }
          const text = stripArtifact(m.content);
          const hasArtifact = extractArtifact(m.content) != null;
          const hasForm = extractForm(m.content) != null;
          return (
            <div key={i} id={`msg-${i}`} className="msg assistant" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <AgentSteps content={m.content} streaming={isLastAssistant && streaming} />
              {hasArtifact && !(isLastAssistant && streaming) && (
                <div className="file-chip">
                  <span>📄</span>
                  {artifactName}
                  <span style={{ marginLeft: "auto", color: "var(--text-tertiary)", display: "inline-flex" }}><ExternalLink size={13} /></span>
                </div>
              )}
              {text && (
                <div className={`bubble ${isLastAssistant && streaming ? "cursor" : ""}`}>{renderMarkdown(text)}</div>
              )}
              {hasForm && (
                <div className="questions-card">
                  <span>⊙</span> Claude has some questions {isLastAssistant ? "→（见右侧画布）" : "（已回答）"}
                </div>
              )}
              {hasArtifact && !(isLastAssistant && streaming) && (
                <div className="action-row">
                  <span>👍</span>
                  <span>👎</span>
                  <span>Edited {artifactName}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="composer">
        <div className="box">
          {(pendingImages.length > 0 || contexts.length > 0 || activeSkill) && (
            <div className="attach-row">
              {activeSkill && (
                <span className="ctx-chip skill">
                  🛠 {activeSkill.title}
                  <button onClick={onClearSkill}><XIcon size={10} /></button>
                </span>
              )}
              {contexts.map((c, i) => (
                <span key={i} className="ctx-chip">
                  {c.label}
                  <button onClick={() => setContexts((p) => p.filter((_, j) => j !== i))}><XIcon size={10} /></button>
                </span>
              ))}
              {pendingImages.map((img, i) => (
                <span key={i} className="attach-chip">
                  <img src={img} alt="" />
                  <button onClick={() => setPendingImages((p) => p.filter((_, j) => j !== i))}><XIcon size={10} /></button>
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={taRef}
            value={input}
            rows={1}
            placeholder={hasProvider ? "Describe what you want to create..." : "先配置模型服务 →"}
            onChange={(e) => {
              setInput(e.target.value);
              autoGrow();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            disabled={!hasProvider}
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
                  setPendingImages((p) => [...p, ...urls].slice(0, 4));
                }
                e.target.value = "";
              }}
            />
            <div style={{ position: "relative" }}>
              <button className="iconbtn" title="附加内容" onClick={() => setPlusOpen((v) => !v)}>
                <PlusIcon size={16} />
              </button>
              {plusOpen && (
                <PlusMenu
                  onAttachFiles={() => fileRef.current?.click()}
                  onAttachContext={(ctx) => setContexts((p) => [...p, ctx])}
                  onOpenSkills={onOpenSkills}
                  onOpenDesignSystem={onOpenDesignSystem}
                  onClose={() => setPlusOpen(false)}
                />
              )}
            </div>
            <div className="grow" />
            <ModelPicker meta={meta} onMetaChanged={onMetaChanged} onOpenSettings={onOpenSettings} align="up" />
            {streaming ? (
              <button className="send" onClick={onStop} title="停止" style={{ background: "var(--text-secondary)" }}>
                <StopIcon size={15} />
              </button>
            ) : (
              <button
                className="send"
                onClick={submit}
                disabled={(!input.trim() && !pendingImages.length && !contexts.length) || !hasProvider}
                title="发送"
              >
                <ArrowUp size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
