import { useState } from "react";
import { t } from "../lib/i18n";
import { QuestionForm, FormQuestion, DirectionCard } from "../lib/artifact";

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
      let v = answers[q.id] === "__other__" ? others[q.id] || "" : answers[q.id];
      // number/toggle fall back to their declared default when left untouched
      if (!v && (q.type === "number" || q.type === "toggle") && q.defaultValue != null) v = String(q.defaultValue);
      if (q.type === "toggle" && !v) v = q.off ?? "否";
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
          {t("Continue")}
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
        placeholder={t("Your answer...")}
        value={value === "__other__" ? "" : (value ?? "")}
        onChange={(e) => onPick(e.target.value)}
      />
    );
  }

  if (q.type === "number") {
    const cur = value ?? (q.defaultValue != null ? String(q.defaultValue) : "");
    return (
      <input
        className="qform-number"
        type="number"
        min={q.min}
        max={q.max}
        step={q.step ?? 1}
        placeholder={q.defaultValue != null ? String(q.defaultValue) : ""}
        value={cur}
        onChange={(e) => onPick(e.target.value)}
      />
    );
  }

  if (q.type === "toggle") {
    const on = q.on ?? "是";
    const off = q.off ?? "否";
    const cur = value ?? (q.defaultValue != null ? String(q.defaultValue) : off);
    return (
      <div className="qform-toggle" role="group">
        <button className={`qform-chip ${cur === off ? "on" : ""}`} onClick={() => onPick(off)}>{off}</button>
        <button className={`qform-chip ${cur === on ? "on" : ""}`} onClick={() => onPick(on)}>{on}</button>
      </div>
    );
  }

  if (q.type === "direction") {
    const cards = (q.options ?? []) as DirectionCard[];
    return (
      <div className="qform-directions">
        {cards.map((c, i) => {
          const v = c.label || String(i + 1);
          return (
            <button key={v} className={`qform-direction ${value === v ? "on" : ""}`} onClick={() => onPick(v)}>
              <div className="dir-swatches">
                {(c.palette ?? []).slice(0, 5).map((col, j) => (
                  <span key={j} className="dir-swatch" style={{ background: col }} />
                ))}
              </div>
              <div className="dir-samples">
                <span className="dir-aa" style={{ fontFamily: c.displayFont || "Georgia, serif" }}>Aa</span>
                <span className="dir-body" style={{ fontFamily: c.bodyFont || "system-ui, sans-serif" }}>Ag</span>
              </div>
              <div className="dir-meta">
                <span className="dir-label">{c.label}</span>
                {c.mood && <span className="dir-mood">{c.mood}</span>}
              </div>
            </button>
          );
        })}
        {q.decide && (
          <button className={`qform-chip ${value === DECIDE ? "on" : ""}`} onClick={() => onPick(DECIDE)}>
            {t(DECIDE)}
          </button>
        )}
      </div>
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
          {t(DECIDE)}
        </button>
      )}
      {q.other && (
        <>
          <button className={`qform-chip ${value === "__other__" ? "on" : ""}`} onClick={() => onPick("__other__")}>
            {t("Other")}
          </button>
          {value === "__other__" && (
            <input
              className="qform-other"
              placeholder={t("Other...")}
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
