import { useEffect, useState } from "react";
import { AgentPhase, AgentRunState } from "../lib/api";
import { t, useLang } from "../lib/i18n";
import { ChevronDown } from "./icons";

interface Props {
  run: AgentRunState;
}

const PHASES: { phase: AgentPhase; label: string; active: string }[] = [
  { phase: "preparing", label: "准备设计上下文", active: "正在准备设计上下文" },
  { phase: "requesting", label: "连接模型服务", active: "正在等待模型响应" },
  { phase: "generating", label: "生成设计内容", active: "正在生成设计内容" },
  { phase: "finalizing", label: "整理结果并更新画布", active: "正在整理结果并更新画布" },
];

function formatDuration(ms: number, lang: "zh" | "en") {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return lang === "zh" ? `${seconds} 秒` : `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return lang === "zh" ? `${minutes} 分 ${String(rest).padStart(2, "0")} 秒` : `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

export function AgentSteps({ run }: Props) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const lang = useLang();

  useEffect(() => {
    if (run.status !== "running") return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [run.status, run.startedAt]);

  const activeIndex = PHASES.findIndex((item) => item.phase === run.phase);
  const elapsed = (run.endedAt ?? now) - run.startedAt;
  const quietFor = now - run.lastActivityAt;
  const phaseFor = now - run.phaseStartedAt;
  const stalled = run.status === "running" && quietFor >= 25_000;
  const slow = run.status === "running" && run.phase === "requesting" && phaseFor >= 20_000;

  let title = t(PHASES[activeIndex]?.active ?? "正在处理");
  if (stalled) title = t("暂时没有收到新进度");
  else if (slow) title = t("模型响应较慢，仍在等待");
  else if (run.status === "completed") title = t("设计已完成");
  else if (run.status === "stopped") title = t("生成已停止");
  else if (run.status === "error") title = t("生成遇到问题");

  return (
    <div className={`agent-activity is-${run.status}`} role="status" aria-live="polite">
      <button className="agent-activity-head" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="agent-signal" aria-hidden="true"><span /></span>
        <span className="agent-activity-title">{title}</span>
        <span className="agent-elapsed">{formatDuration(elapsed, lang)}</span>
        <ChevronDown size={13} className={open ? "agent-chevron open" : "agent-chevron"} />
      </button>

      {open && (
        <div className="agent-step-list">
          {PHASES.map((item, index) => {
            const isCurrent = run.status === "running" && index === activeIndex;
            const isDone = run.status === "completed" || index < activeIndex;
            const isInterrupted = run.status !== "running" && run.status !== "completed" && index === activeIndex;
            return (
              <div
                key={item.phase}
                className={`agent-step${isDone ? " done" : ""}${isCurrent ? " current" : ""}${isInterrupted ? " interrupted" : ""}`}
              >
                <span className="agent-step-mark" aria-hidden="true" />
                <span>{t(item.label)}</span>
              </div>
            );
          })}
          {stalled && <p className="agent-activity-note">{t("可以继续等待；若长时间没有变化，可停止后重试。")}</p>}
        </div>
      )}
    </div>
  );
}
