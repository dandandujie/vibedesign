import { useEffect, useRef, useState } from "react";
import { t } from "../lib/i18n";
import { fetchGithubRepo } from "../lib/api";
import { clampPop } from "../lib/popover";
import { pickLocalCodebase } from "../lib/localCodebase";

export interface CodebaseCtx {
  label: string;
  text: string;
}

interface Props {
  current: CodebaseCtx | null;
  onSet: (ctx: CodebaseCtx | null) => void;
}

// "</>" button per user's Image 1: "Base designs off what's currently in code?"
// None / Local codebase: Attach / Codebase from GitHub: Connect GitHub.
export function CodebaseMenu({ current, onSet }: Props) {
  const [open, setOpen] = useState(false);
  const [ghInput, setGhInput] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const attachLocal = async () => {
    try {
      const result = await pickLocalCodebase();
      if (!result.ok) {
        setErr(result.error);
        return;
      }
      onSet({
        label: `代码库：${result.name}`,
        text:
          `\n\n（以下是本地代码库「${result.name}」中与设计相关的文件，设计必须基于其中的真实 tokens/样式）\n` +
          result.text,
      });
      setOpen(false);
    } catch {
      /* cancelled */
    }
  };

  const connectGithub = async () => {
    if (!repoUrl.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const { repo, files } = await fetchGithubRepo(repoUrl.trim());
      onSet({
        label: `代码库：${repo}`,
        text:
          `\n\n（以下是 GitHub 仓库 ${repo} 中与设计相关的文件，设计必须基于其中的真实 tokens/样式）\n` +
          files.map((f) => `--- ${f.path} ---\n${f.content}`).join("\n"),
      });
      setOpen(false);
      setGhInput(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="codebase-menu" ref={ref}>
      <button className={`code-btn ${current ? "on" : ""}`} title="Base designs off code" onClick={() => setOpen((v) => !v)}>
        {"</>"}
      </button>
      {open && (
        <div className="plus-menu" style={{ width: 300 }} ref={clampPop}>
          <div className="pm-label" style={{ fontSize: 14.5, color: "var(--text-primary)", fontWeight: 600 }}>
            {t("Base designs off what's currently in code?")}
          </div>
          <button className={`pm-item ${!current ? "hl" : ""}`} onClick={() => { onSet(null); setOpen(false); }}>
            {t("None")}
          </button>
          <div className="pm-sep" />
          <div className="pm-label">{t("Local codebase")}</div>
          <button className="pm-item" onClick={attachLocal}>
            <span className="ic">🗂</span> {t("Attach")}
          </button>
          <div className="pm-sep" />
          <div className="pm-label">{t("Codebase from GitHub")}</div>
          {!ghInput ? (
            <button className="pm-item" onClick={() => setGhInput(true)}>
              {t("Connect GitHub")}
            </button>
          ) : (
            <div style={{ padding: "4px 10px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
              <input
                autoFocus
                placeholder="https://github.com/owner/repo"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && connectGithub()}
                style={{ border: "1px solid var(--border-default)", borderRadius: 8, padding: "8px 10px", fontSize: 14, fontFamily: "inherit" }}
              />
              <button className="btn primary small" style={{ alignSelf: "flex-end" }} disabled={busy || !repoUrl.trim()} onClick={connectGithub}>
                {busy ? "拉取中…" : "拉取"}
              </button>
            </div>
          )}
          {err && <div className="pm-err">{err}</div>}
        </div>
      )}
    </div>
  );
}
