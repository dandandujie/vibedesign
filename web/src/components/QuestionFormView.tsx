import { useState } from "react";
import { QuestionForm, FormQuestion } from "../lib/artifact";

interface Props {
  form: QuestionForm;
  onSubmit: (answersText: string) => void;
}

const DECIDE = "Decide for me";

// Canvas-rendered clarifying-question form per field study §4: serif title,
// palette cards / chip groups / text inputs, "Decide for me" everywhere, and
// an orange Continue that folds answers back into a "Questions answered:" list.
export function QuestionFormView({ form, onSubmit }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [others, setOthers] = useState<Record<string, string>>({});

  const set = (id: string, v: string) => setAnswers((p) => ({ ...p, [id]: v }));

  const submit = () => {
    const lines = form.questions.map((q) => {
      const v = answers[q.id] === "__other__" ? others[q.id] || "" : answers[q.id];
      return `- ${q.id}: ${v || (q.optional ? "(skipped)" : DECIDE)}`;
    });
    onSubmit(`Questions answered:\n${lines.join("\n")}`);
  };

  return (
    <div className="qform">
      <h2 className="qform-title">{form.title}</h2>
      {form.questions.map((q) => (
        <div key={q.id} className="qform-q">
          <div className="qform-label">{q.label}</div>
          {q.hint && <div className="qform-hint">{q.hint}</div>}
          <Question q={q} value={answers[q.id]} other={others[q.id] ?? ""} onPick={(v) => set(q.id, v)} onOther={(v) => setOthers((p) => ({ ...p, [q.id]: v }))} />
        </div>
      ))}
      <div className="qform-foot">
        <button className="btn primary" onClick={submit}>
          Continue
        </button>
      </div>
    </div>
  );
}

function Question({
  q,
  value,
  other,
  onPick,
  onOther,
}: {
  q: FormQuestion;
  value?: string;
  other: string;
  onPick: (v: string) => void;
  onOther: (v: string) => void;
}) {
  if (q.type === "text") {
    return (
      <textarea
        className="qform-text"
        rows={2}
        placeholder="Your answer..."
        value={value === "__other__" ? "" : (value ?? "")}
        onChange={(e) => onPick(e.target.value)}
      />
    );
  }

  const opts = q.options ?? [];
  return (
    <div className="qform-chips">
      {q.type === "palette"
        ? opts.map((o, i) => {
            const opt = o as { label: string; colors: string[] };
            const v = opt.label || String(i + 1);
            return (
              <button key={v} className={`qform-palette ${value === v ? "on" : ""}`} onClick={() => onPick(v)}>
                {(opt.colors ?? []).slice(0, 2).map((c) => (
                  <span key={c} className="pcolor" style={{ background: c }} />
                ))}
              </button>
            );
          })
        : opts.map((o) => {
            const v = String(o);
            return (
              <button key={v} className={`qform-chip ${value === v ? "on" : ""}`} onClick={() => onPick(v)}>
                {v}
              </button>
            );
          })}
      {q.decide && (
        <button className={`qform-chip ${value === DECIDE ? "on" : ""}`} onClick={() => onPick(DECIDE)}>
          {DECIDE}
        </button>
      )}
      {q.other && (
        <>
          <button className={`qform-chip ${value === "__other__" ? "on" : ""}`} onClick={() => onPick("__other__")}>
            Other
          </button>
          {value === "__other__" && (
            <input
              className="qform-other"
              placeholder="Other..."
              value={other}
              autoFocus
              onChange={(e) => onOther(e.target.value)}
            />
          )}
        </>
      )}
    </div>
  );
}
