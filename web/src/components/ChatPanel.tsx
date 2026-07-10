import { useEffect, useRef, useState } from "react";
import { ChatMessage, Meta, setActiveProvider } from "../lib/api";
import { stripArtifact, extractArtifact, extractForm } from "../lib/artifact";
import { renderMarkdown } from "../lib/markdown";
import { AgentSteps } from "./AgentSteps";

interface Props {
  projectName: string;
  onRename: (name: string) => void;
  artifactName: string; // e.g. "Hero.html" — shown on file chips
  messages: ChatMessage[];
  streaming: boolean;
  meta: Meta | null;
  onMetaChanged: () => void;
  skills: { id: string; title: string }[];
  activeSkill: string | null;
  setActiveSkill: (id: string | null) => void;
  onSend: (text: string, images?: string[]) => void;
  onStop: () => void;
  onOpenSettings: () => void;
  hasProvider: boolean;
}

// Read image files into data URLs for multimodal messages.
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

const EXAMPLES = [
  "一个 SaaS 落地页 hero，克制、暖色",
  "理财 App dashboard 原型",
  "5 页产品发布 keynote",
];

function renderUser(content: string) {
  const idx = content.indexOf("```html");
  if (idx === -1) return <div className="bubble">{content}</div>;
  return (
    <>
      <div className="bubble">{content.slice(0, idx).trim()}</div>
      <div className="snapshot">📎 已附上当前设计快照</div>
    </>
  );
}

// Chat pane per field study §2-3: narrow column, own header (logo + project
// name), serif assistant prose, step groups, file chips, composer with the
// model picker in the tool row (BYOK stand-in for "Opus 4.8 Medium ▾").
export function ChatPanel({
  projectName,
  onRename,
  artifactName,
  messages,
  streaming,
  meta,
  onMetaChanged,
  skills,
  activeSkill,
  setActiveSkill,
  onSend,
  onStop,
  onOpenSettings,
  hasProvider,
}: Props) {
  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState<string[]>([]);
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
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
  };

  const submit = () => {
    const t = input.trim();
    if ((!t && pendingImages.length === 0) || streaming) return;
    onSend(t || "（见附图）", pendingImages.length ? pendingImages : undefined);
    setInput("");
    setPendingImages([]);
    requestAnimationFrame(autoGrow);
  };

  const providers = meta?.providers ?? [];

  return (
    <section className="chat">
      <div className="chat-head">
        <span className="logo" />
        <input className="pname" value={projectName} onChange={(e) => onRename(e.target.value)} spellCheck={false} />
        <button className="iconbtn" title="返回项目列表" onClick={() => (location.hash = "#/")}>
          ⌂
        </button>
      </div>

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
              <div key={i} className="msg user">
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
            <div key={i} className="msg assistant" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <AgentSteps content={m.content} streaming={isLastAssistant && streaming} />
              {hasArtifact && !(isLastAssistant && streaming) && (
                <div className="file-chip">
                  <span>📄</span>
                  {artifactName}
                  <span style={{ marginLeft: "auto", color: "var(--text-tertiary)" }}>↗</span>
                </div>
              )}
              {text && (
                <div className={`bubble ${isLastAssistant && streaming ? "cursor" : ""}`}>
                  {renderMarkdown(text)}
                </div>
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
          {pendingImages.length > 0 && (
            <div className="attach-row">
              {pendingImages.map((img, i) => (
                <span key={i} className="attach-chip">
                  <img src={img} alt="" />
                  <button onClick={() => setPendingImages((p) => p.filter((_, j) => j !== i))}>✕</button>
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
            <button className="iconbtn" title="添加图片（截图/参考图）" onClick={() => fileRef.current?.click()}>
              ＋
            </button>
            <select
              className="skill-pick"
              value={activeSkill ?? ""}
              onChange={(e) => setActiveSkill(e.target.value || null)}
              title="设计技能"
            >
              <option value="">技能: 自动</option>
              {skills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id}
                </option>
              ))}
            </select>
            <div className="grow" />
            <select
              className="model-pick"
              value={meta?.activeProviderId ?? ""}
              onChange={async (e) => {
                if (e.target.value === "__add__") {
                  onOpenSettings();
                  return;
                }
                await setActiveProvider(e.target.value);
                onMetaChanged();
              }}
              title="模型（BYOK）"
            >
              {providers.length === 0 && <option value="">未配置模型</option>}
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="__add__">＋ 添加…</option>
            </select>
            {streaming ? (
              <button className="send" onClick={onStop} title="停止" style={{ background: "var(--text-secondary)" }}>
                ■
              </button>
            ) : (
              <button className="send" onClick={submit} disabled={!input.trim() || !hasProvider} title="发送">
                ↑
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
