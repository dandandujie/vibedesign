import { useEffect, useRef, useState } from "react";
import { t } from "../lib/i18n";
import { SelectedInfo } from "../lib/types";
import { filesToDataUrls } from "./ChatPanel";
import { XIcon } from "./icons";

interface Props {
  selected: SelectedInfo;
  frameOffset: { left: number; top: number };
  pinNumber: number;
  onAddComment: (text: string) => void;
  onSendToClaude: (text: string, images?: string[]) => void;
  onCancel: () => void;
}

// Annotate popover per field study §6, with file attachments (user req #11).
export function CommentPopover({ selected, frameOffset, pinNumber, onAddComment, onSendToClaude, onCancel }: Props) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText("");
    setImages([]);
    taRef.current?.focus();
  }, [selected.path]);

  const pinLeft = frameOffset.left + selected.rect.x + selected.rect.w - 10;
  const pinTop = frameOffset.top + selected.rect.y - 10;
  const popLeft = Math.max(8, frameOffset.left + selected.rect.x);
  const popTop = frameOffset.top + selected.rect.y + selected.rect.h + 8;

  const send = () => {
    if (!text.trim() && !images.length) return;
    onSendToClaude(text.trim() || "（见附图）", images.length ? images : undefined);
  };

  return (
    <>
      <div className="pin-badge" style={{ left: pinLeft, top: Math.max(0, pinTop) }}>
        {pinNumber}
      </div>
      <div className="comment-pop" style={{ left: popLeft, top: popTop }}>
        <div className="head">
          <span>Annotate</span>
          <button className="iconbtn" onClick={onCancel} style={{ padding: "0 2px" }}>
            <XIcon size={13} />
          </button>
        </div>
        {images.length > 0 && (
          <div className="attach-row">
            {images.map((img, i) => (
              <span key={i} className="attach-chip">
                <img src={img} alt="" />
                <button onClick={() => setImages((p) => p.filter((_, j) => j !== i))}><XIcon size={12} /></button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={taRef}
          rows={2}
          placeholder="Describe the issue or suggestion..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
            if (e.key === "Escape") onCancel();
          }}
        />
        <div className="actions">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={async (e) => {
              if (e.target.files?.length) {
                const urls = await filesToDataUrls(e.target.files);
                setImages((p) => [...p, ...urls].slice(0, 3));
              }
              e.target.value = "";
            }}
          />
          <button className="iconbtn" title={t("附图")} onClick={() => fileRef.current?.click()}>
            📎
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn ghost small" disabled={!text.trim()} onClick={() => onAddComment(text.trim())}>
            Add comment
          </button>
          <button className="btn primary small" disabled={!text.trim() && !images.length} onClick={send}>
            Send to Claude
          </button>
        </div>
      </div>
    </>
  );
}
