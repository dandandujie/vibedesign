import { useState } from "react";
import { CommentPin } from "../lib/projects";

interface Props {
  comments: CommentPin[];
  onResolve: (id: string) => void;
  onDelete: (id: string) => void;
  onAddGlobal: (text: string) => void; // comment not tied to an element
  onSendAllToClaude: () => void;
  onClose: () => void;
}

// Annotate mode swaps the chat pane for this Comments panel (field study §6).
export function CommentsPanel({ comments, onResolve, onDelete, onAddGlobal, onSendAllToClaude, onClose }: Props) {
  const [text, setText] = useState("");
  const open = comments.filter((c) => !c.resolved);

  return (
    <section className="chat">
      <div className="chat-head">
        <span style={{ fontSize: 12, fontWeight: 600 }}>Comments</span>
        <div style={{ flex: 1 }} />
        <button className="iconbtn" onClick={onClose} title="退出评论模式">
          ✕
        </button>
      </div>

      <div className="messages">
        {comments.length === 0 && (
          <p className="muted small" style={{ padding: "8px 2px", lineHeight: 1.6 }}>
            No comments yet. Leave feedback below, or click an element in the canvas to pin one.
          </p>
        )}
        {comments.map((c, i) => (
          <div key={c.id} className={`comment-item ${c.resolved ? "resolved" : ""}`}>
            <div className="row1">
              <span className="pin-mini">{i + 1}</span>
              <span className="path" title={c.path}>
                {c.path ? `<${c.path.split(">").pop()?.trim().split(":")[0] ?? "element"}>` : "整体"}
              </span>
              <span style={{ flex: 1 }} />
              {!c.resolved && (
                <button className="iconbtn" title="标记已解决" onClick={() => onResolve(c.id)}>
                  ✓
                </button>
              )}
              <button className="iconbtn" title="删除" onClick={() => onDelete(c.id)}>
                ✕
              </button>
            </div>
            <div className="ctext">{c.text}</div>
          </div>
        ))}
        {open.length > 0 && (
          <button className="btn primary small" style={{ alignSelf: "flex-start" }} onClick={onSendAllToClaude}>
            让 Claude 处理 {open.length} 条未解决评论
          </button>
        )}
      </div>

      <div className="composer">
        <div className="box">
          <textarea
            rows={1}
            placeholder="Add a comment..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (text.trim()) {
                  onAddGlobal(text.trim());
                  setText("");
                }
              }
            }}
          />
          <div className="toolrow">
            <div className="grow" />
            <button
              className="send"
              disabled={!text.trim()}
              onClick={() => {
                if (text.trim()) {
                  onAddGlobal(text.trim());
                  setText("");
                }
              }}
              title="添加评论"
            >
              ↑
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
