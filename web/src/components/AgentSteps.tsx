import { useState } from "react";
import { ChevronDown, ChevronRight } from "./icons";

interface Props {
  content: string;
  streaming: boolean;
}

// Field study §3: finished work collapses into a "✦ <summary>" pill row;
// the in-flight action shows as "✶ <Gerund>..." with a spinning spark.
export function AgentSteps({ content, streaming }: Props) {
  const [open, setOpen] = useState(false);

  const hasText = content.trim().length > 0;
  const opens = (content.match(/```html/gi) || []).length;
  const fenceClosed = opens > 0 && (content.match(/```/g) || []).length >= opens * 2;
  const designing = opens > 0;

  const done: string[] = [];
  if (hasText) done.push("Thinking");
  if (designing && (fenceClosed || !streaming)) done.push("Designing");

  let live: string | null = null;
  if (streaming) {
    if (!hasText) live = "Thinking";
    else if (designing && !fenceClosed) live = "Designing";
  }

  if (!designing && !streaming) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {done.length > 0 && (
        <>
          <button className="steps-group" onClick={() => setOpen((v) => !v)}>
            <span className="spark">✦</span>
            {done.join(", ")}
            <span className="chev">{open ? <ChevronDown size={12} style={{ transform: "rotate(180deg)" }} /> : <ChevronDown size={12} />}</span>
          </button>
          {open && (
            <div className="steps-detail">
              {done.map((s) => (
                <div key={s} className="row">
                  <span className="ok">✓</span>
                  {s}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {live && (
        <div className="step-live">
          <span className="spark">✶</span>
          {live}…
        </div>
      )}
    </div>
  );
}
