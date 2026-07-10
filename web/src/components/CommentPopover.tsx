import { useEffect, useRef, useState } from "react";
import { SelectedInfo } from "../lib/types";

interface Props {
  selected: SelectedInfo;
  frameOffset: { left: number; top: number };
  pinNumber: number;
  onAddComment: (text: string) => void; // keep as note only
  onSendToClaude: (text: string) => void; // act immediately
  onCancel: () => void;
}

// Annotate popover per field study §6: numbered orange pin at the element's
// corner, card with "Describe the issue or suggestion..." and the dual
// actions "Add comment" / "Send to Claude".
export function CommentPopover({
  selected,
  frameOffset,
  pinNumber,
  onAddComment,
  onSendToClaude,
  onCancel,
}: Props) {
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setText("");
    taRef.current?.focus();
  }, [selected.path]);

  const pinLeft = frameOffset.left + selected.rect.x + selected.rect.w - 10;
  const pinTop = frameOffset.top + selected.rect.y - 10;
  const popLeft = Math.max(8, frameOffset.left + selected.rect.x);
  const popTop = frameOffset.top + selected.rect.y + selected.rect.h + 8;

  return (
    <>
      <div className="pin-badge" style={{ left: pinLeft, top: Math.max(0, pinTop) }}>
        {pinNumber}
      </div>
      <div className="comment-pop" style={{ left: popLeft, top: popTop }}>
        <div className="head">
          <span>Annotate</span>
          <button className="iconbtn" onClick={onCancel} style={{ padding: "0 2px" }}>
            ✕
          </button>
        </div>
        <textarea
          ref={taRef}
          rows={2}
          placeholder="Describe the issue or suggestion..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim()) onSendToClaude(text.trim());
            }
            if (e.key === "Escape") onCancel();
          }}
        />
        <div className="actions">
          <button className="btn ghost small" disabled={!text.trim()} onClick={() => onAddComment(text.trim())}>
            Add comment
          </button>
          <button className="btn primary small" disabled={!text.trim()} onClick={() => onSendToClaude(text.trim())}>
            Send to Claude
          </button>
        </div>
      </div>
    </>
  );
}
