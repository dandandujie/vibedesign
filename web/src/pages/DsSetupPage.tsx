import { useRef, useState } from "react";
import { fetchGithubRepo } from "../lib/api";
import { newProject, saveProject } from "../lib/projects";
import { filesToDataUrls } from "../components/ChatPanel";

// Design-system setup, replicated from the live field study (2026-07-11):
// full-page form (blurb / GitHub / local folder / assets / notes) →
// confirmation ("~5 minutes") → Generate → a DS project whose result is
// auto-saved as a reusable design system.
export function DsSetupPage() {
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [blurb, setBlurb] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [repoCtx, setRepoCtx] = useState<string | null>(null);
  const [repoLabel, setRepoLabel] = useState<string | null>(null);
  const [localCtx, setLocalCtx] = useState<string | null>(null);
  const [localLabel, setLocalLabel] = useState<string | null>(null);
  const [assets, setAssets] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const assetRef = useRef<HTMLInputElement>(null);

  const addRepo = async () => {
    if (!repoUrl.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const { repo, files } = await fetchGithubRepo(repoUrl.trim());
      setRepoCtx(files.map((f) => `--- ${f.path} ---\n${f.content}`).join("\n"));
      setRepoLabel(`${repo}（${files.length} 个文件）`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const attachLocal = async () => {
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
          if (h.kind === "directory") await walk(h as FileSystemDirectoryHandle, `${prefix}${name}/`, depth + 1);
          else if (/\.(css|scss)$|tokens?\.(json|js|ts)$|tailwind\.config\.|theme\.|package\.json$/i.test(name)) {
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
      setLocalCtx(files.map((f) => `--- ${f.path} ---\n${f.content}`).join("\n"));
      setLocalLabel(`${dir.name}（${files.length} 个文件）`);
    } catch {
      /* cancelled */
    }
  };

  const generate = async () => {
    const name = blurb.split(/[:：.。\n]/)[0].trim().slice(0, 30) || "Design system";
    const p = newProject(`${name} · Design System`);
    await saveProject(p);
    let seed =
      `为以下品牌创建一套完整的 design system：\n${blurb}\n` +
      (notes ? `\n补充说明：${notes}\n` : "") +
      (repoCtx ? `\n（GitHub 代码库中的设计相关文件——提取其中的真实 tokens）\n${repoCtx}\n` : "") +
      (localCtx ? `\n（本地代码库中的设计相关文件——提取其中的真实 tokens）\n${localCtx}\n` : "") +
      `\n输出要求（务必遵守）：\n` +
      `1. 先输出一个 \`\`\`vddesignsystem 代码块：纯文本的 design system 规范（色彩 tokens 十六进制、字体族与字阶、间距刻度、圆角/阴影、组件规范、语气），后续设计将直接依据这份文本。\n` +
      `2. 然后输出 \`\`\`html 展示页：完整呈现 tokens、色板、字体样本与核心组件（按钮/卡片/输入框各状态）。`;
    sessionStorage.setItem(
      `vd_seed_${p.id}`,
      JSON.stringify({ text: seed, images: assets.length ? assets : undefined, dsSetup: true }),
    );
    location.hash = `#/p/${p.id}`;
  };

  return (
    <div className="ds-setup">
      <header className="ds-setup-bar">
        <button className="btn" onClick={() => (step === "confirm" ? setStep("form") : (location.hash = "#/?tab=design-systems"))}>
          ← Back
        </button>
        {step === "form" && (
          <button className="btn primary" disabled={!blurb.trim()} onClick={() => setStep("confirm")}>
            Continue to generation →
          </button>
        )}
      </header>

      {step === "form" ? (
        <main className="ds-setup-main">
          <div className="ds-setup-icon">⚭</div>
          <h1 className="ds-setup-title">Set up your design system</h1>
          <p className="ds-setup-sub">Tell us about your company and attach any design resources you have.</p>

          <label className="ds-setup-label">
            Company name and blurb <span className="muted">(or name of design system)</span>
          </label>
          <textarea
            className="ds-setup-blurb"
            rows={3}
            placeholder="e.g. Mission Impastabowl: fast-casual pasta restaurant with in-store touchscreen kiosk, mobile app and website"
            value={blurb}
            onChange={(e) => setBlurb(e.target.value)}
          />

          <h2 className="ds-setup-h2">
            Provide examples of your design system and products <span className="opt">(all optional)</span>
          </h2>
          <p className="muted" style={{ margin: "0 0 12px", fontSize: 14 }}>
            What works best: code and designs for your design system and your code products.
          </p>

          <div className="ds-setup-card">
            <div className="dsr">
              <span className="dsr-label">Link code from GitHub</span>
              <span className="dsr-value">
                {repoLabel ? (
                  <span className="ctx-chip">
                    {repoLabel}
                    <button onClick={() => { setRepoCtx(null); setRepoLabel(null); }}>✕</button>
                  </span>
                ) : (
                  <>
                    <input
                      placeholder="https://github.com/owner/repo"
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addRepo()}
                    />
                    <button className="btn small" disabled={busy || !repoUrl.trim()} onClick={addRepo}>
                      {busy ? "…" : "Add"}
                    </button>
                  </>
                )}
              </span>
            </div>
            <div className="dsr">
              <span className="dsr-label">Link code from your computer</span>
              <span className="dsr-value">
                {localLabel ? (
                  <span className="ctx-chip">
                    {localLabel}
                    <button onClick={() => { setLocalCtx(null); setLocalLabel(null); }}>✕</button>
                  </span>
                ) : (
                  <button className="drop-zone" onClick={attachLocal}>
                    Drag a folder here or <u>browse</u>
                  </button>
                )}
              </span>
            </div>
            <p className="dsr-note">
              This doesn't upload the whole codebase; design-relevant files are copied locally. For large codebases, attach a
              frontend-focused subfolder.
            </p>
            <div className="dsr">
              <span className="dsr-label">Upload a .fig file</span>
              <span className="dsr-value">
                <button className="drop-zone" disabled title="即将支持">
                  Drop .fig here or <u>browse</u>（即将支持）
                </button>
              </span>
            </div>
            <div className="dsr">
              <span className="dsr-label">Add fonts, logos and assets</span>
              <span className="dsr-value">
                <input
                  ref={assetRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={async (e) => {
                    if (e.target.files?.length) {
                      const urls = await filesToDataUrls(e.target.files);
                      setAssets((p) => [...p, ...urls].slice(0, 4));
                    }
                    e.target.value = "";
                  }}
                />
                {assets.length > 0 && (
                  <span className="attach-row" style={{ paddingBottom: 0 }}>
                    {assets.map((a, i) => (
                      <span key={i} className="attach-chip">
                        <img src={a} alt="" />
                        <button onClick={() => setAssets((p) => p.filter((_, j) => j !== i))}>✕</button>
                      </span>
                    ))}
                  </span>
                )}
                <button className="drop-zone" onClick={() => assetRef.current?.click()}>
                  Drag files here or <u>browse</u>
                </button>
              </span>
            </div>
          </div>

          <label className="ds-setup-label" style={{ marginTop: 20 }}>
            Any other notes?
          </label>
          <textarea
            className="ds-setup-blurb"
            rows={3}
            placeholder="e.g. We use a warm, earthy color palette with rounded corners. Our brand voice is playful but professional..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {err && <p style={{ color: "var(--accent-error)", fontSize: 13.5 }}>{err}</p>}
        </main>
      ) : (
        <main className="ds-setup-confirm">
          <h1>It will take a few minutes to generate your design system.</h1>
          <p className="muted">You can step away. Keep the tab open in the background.</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 22 }}>
            <button className="btn" onClick={() => setStep("form")}>
              ← Back
            </button>
            <button className="btn primary" onClick={generate}>
              ⚡ Generate
            </button>
          </div>
        </main>
      )}
    </div>
  );
}
