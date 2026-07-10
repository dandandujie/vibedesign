import { useEffect, useRef, useState } from "react";
import { ProjectListItem, listProjects, getProject } from "../lib/projects";
import { fetchGithubRepo } from "../lib/api";

export interface AttachedContext {
  label: string; // shown as a chip
  text: string; // appended to the outgoing message
}

interface Props {
  onAttachFiles: () => void; // opens the existing image file picker
  onAttachContext: (ctx: AttachedContext) => void;
  onOpenSkills: () => void;
  onOpenDesignSystem: () => void;
  onClose: () => void;
}

// "+" menu per user's Image 2: Files / Code / Designs sections plus Design
// system, Skills and Manage connectors rows.
export function PlusMenu({ onAttachFiles, onAttachContext, onOpenSkills, onOpenDesignSystem, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"root" | "projects" | "github">("root");
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [repoUrl, setRepoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);

  const pickProject = async (id: string) => {
    const p = await getProject(id);
    const html = p?.artifacts.find((a) => a.id === p.activeVersionId)?.html ?? p?.artifacts.at(-1)?.html;
    if (p && html) {
      onAttachContext({
        label: `引用项目：${p.name}`,
        text: `\n\n（参考项目「${p.name}」的当前设计，保持其视觉语言一致）\n\`\`\`html\n${html}\n\`\`\``,
      });
    }
    onClose();
  };

  const linkLocalCode = async () => {
    type DirPicker = { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> };
    const w = window as unknown as DirPicker;
    if (!w.showDirectoryPicker) {
      setErr("此环境不支持选择文件夹");
      return;
    }
    try {
      const dir = await w.showDirectoryPicker();
      const files: { path: string; content: string }[] = [];
      let total = 0;
      async function walk(handle: FileSystemDirectoryHandle, prefix: string, depth: number) {
        if (depth > 3 || files.length >= 12 || total > 120_000) return;
        for await (const [name, h] of handle as unknown as AsyncIterable<[string, FileSystemHandle]>) {
          if (files.length >= 12 || total > 120_000) return;
          if (name.startsWith(".") || name === "node_modules" || name === "dist") continue;
          if (h.kind === "directory") {
            await walk(h as FileSystemDirectoryHandle, `${prefix}${name}/`, depth + 1);
          } else if (/\.(css|scss)$|tokens?\.(json|js|ts)$|tailwind\.config\.|theme\.|package\.json$/i.test(name)) {
            const file = await (h as FileSystemFileHandle).getFile();
            if (file.size < 60_000) {
              const content = (await file.text()).slice(0, 25_000);
              total += content.length;
              files.push({ path: prefix + name, content });
            }
          }
        }
      }
      await walk(dir, "", 0);
      if (!files.length) {
        setErr("未找到样式/tokens 相关文件");
        return;
      }
      onAttachContext({
        label: `本地代码：${dir.name}（${files.length} 个文件）`,
        text:
          `\n\n（以下是本地代码库「${dir.name}」中与设计相关的文件，严格使用其中的真实 tokens/样式）\n` +
          files.map((f) => `--- ${f.path} ---\n${f.content}`).join("\n"),
      });
      onClose();
    } catch {
      /* user cancelled */
    }
  };

  const connectGithub = async () => {
    if (!repoUrl.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const { repo, files } = await fetchGithubRepo(repoUrl.trim());
      onAttachContext({
        label: `GitHub：${repo}（${files.length} 个文件）`,
        text:
          `\n\n（以下是 GitHub 仓库 ${repo} 中与设计相关的文件，严格使用其中的真实 tokens/样式）\n` +
          files.map((f) => `--- ${f.path} ---\n${f.content}`).join("\n"),
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="plus-menu" ref={ref}>
      {view === "root" && (
        <>
          <div className="pm-label">Files</div>
          <button className="pm-item" onClick={() => { onAttachFiles(); onClose(); }}>
            <span className="ic">📎</span> Attach file
          </button>
          <button className="pm-item" onClick={async () => { setProjects(await listProjects()); setView("projects"); }}>
            <span className="ic">🗂</span> Reference another project
          </button>
          <div className="pm-sep" />
          <div className="pm-label">Code</div>
          <button className="pm-item" onClick={() => setView("github")}>
            <span className="ic">⎇</span> Connect GitHub
          </button>
          <button className="pm-item" onClick={linkLocalCode}>
            <span className="ic">📁</span> Link local code…
          </button>
          <div className="pm-sep" />
          <div className="pm-label">Designs</div>
          <button className="pm-item" disabled title="即将支持">
            <span className="ic">⬆</span> Upload .fig file
            <span className="pm-tail">即将支持</span>
          </button>
          <div className="pm-sep" />
          <button className="pm-item" onClick={() => { onOpenDesignSystem(); onClose(); }}>
            <span className="ic">🎨</span> Design system
          </button>
          <button className="pm-item" onClick={() => { onOpenSkills(); onClose(); }}>
            <span className="ic">🛠</span> Skills
          </button>
          <button className="pm-item" disabled title="即将支持">
            <span className="ic">⊞</span> Manage connectors
            <span className="pm-tail">即将支持</span>
          </button>
          {err && <div className="pm-err">{err}</div>}
        </>
      )}

      {view === "projects" && (
        <>
          <div className="pm-label">选择要引用的项目</div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {projects.map((p) => (
              <button key={p.id} className="pm-item" onClick={() => pickProject(p.id)}>
                <span className="ic">📄</span> {p.name}
              </button>
            ))}
          </div>
          <button className="pm-item muted" onClick={() => setView("root")}>
            ← 返回
          </button>
        </>
      )}

      {view === "github" && (
        <>
          <div className="pm-label">公开仓库 URL</div>
          <div style={{ padding: "4px 10px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              autoFocus
              placeholder="https://github.com/owner/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && connectGithub()}
              style={{
                border: "1px solid var(--border-default)",
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 14,
                fontFamily: "inherit",
              }}
            />
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <button className="btn ghost small" onClick={() => setView("root")}>
                返回
              </button>
              <button className="btn primary small" disabled={busy || !repoUrl.trim()} onClick={connectGithub}>
                {busy ? "拉取中…" : "拉取设计文件"}
              </button>
            </div>
            {err && <div className="pm-err">{err}</div>}
          </div>
        </>
      )}
    </div>
  );
}
