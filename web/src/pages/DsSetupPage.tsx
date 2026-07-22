import { useRef, useState } from "react";
import { t } from "../lib/i18n";
import { fetchGithubRepo } from "../lib/api";
import { newProject, saveProject } from "../lib/projects";
import { filesToDataUrls } from "../components/ChatPanel";
import { parseDesignFile } from "../lib/designFileImport";
import { pickLocalCodebase } from "../lib/localCodebase";
import { XIcon } from "../components/icons";

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
  const [figCtx, setFigCtx] = useState<string | null>(null);
  const [figLabel, setFigLabel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const assetRef = useRef<HTMLInputElement>(null);
  const figRef = useRef<HTMLInputElement>(null);

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
    try {
      const result = await pickLocalCodebase();
      if (!result.ok) {
        setErr(result.error);
        return;
      }
      setLocalCtx(result.text);
      setLocalLabel(`${result.name}（${result.files.length} 个文件）`);
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
      (figCtx ? `\n${figCtx}\n` : "") +
      `\n输出要求（务必遵守）：\n` +
      `1. 先输出一个 \`\`\`vddesignsystem 代码块：一份结构化的 design system 规范（DESIGN.md），按 9 段组织——① 视觉主题与氛围 ② 色板与角色 ③ 排版规则 ④ 组件样式 ⑤ 布局原则 ⑥ 深度与层次 ⑦ Do's & Don'ts ⑧ 响应式 ⑨ Agent 使用指引。这是散文式的意图与语气说明。\n` +
      `2. 再输出一个 \`\`\`vddstokens 代码块：与上面规范对应的机器可读 token 契约——一个 :root {} 块，含色彩/字体族/字阶/间距/圆角/阴影的 CSS 自定义属性，值用真实十六进制。后续每个设计都会把这个 :root 逐字粘进第一个 <style>，所以命名要规范、值要确定、不要遗漏常用 token。\n` +
      `3. 最后输出 \`\`\`html 展示页：完整呈现 tokens、色板、字体样本与核心组件（按钮/卡片/输入框各状态）。`;
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
          {t("← Back")}
        </button>
        {step === "form" && (
          <button className="btn primary" disabled={!blurb.trim()} onClick={() => setStep("confirm")}>
            {t("Continue to generation →")}
          </button>
        )}
      </header>

      {step === "form" ? (
        <main className="ds-setup-main">
          <div className="ds-setup-icon">⚭</div>
          <h1 className="ds-setup-title">{t("Set up your design system")}</h1>
          <p className="ds-setup-sub">{t("Tell us about your company and attach any design resources you have.")}</p>

          <label className="ds-setup-label">
            {t("Company name and blurb")} <span className="muted">{t("(or name of design system)")}</span>
          </label>
          <textarea
            className="ds-setup-blurb"
            rows={3}
            placeholder="e.g. Mission Impastabowl: fast-casual pasta restaurant with in-store touchscreen kiosk, mobile app and website"
            value={blurb}
            onChange={(e) => setBlurb(e.target.value)}
          />

          <h2 className="ds-setup-h2">
            {t("Provide examples of your design system and products")} <span className="opt">{t("(all optional)")}</span>
          </h2>
          <p className="muted" style={{ margin: "0 0 12px", fontSize: 14 }}>
            {t("What works best: code and designs for your design system and your code products.")}
          </p>

          <div className="ds-setup-card">
            <div className="dsr">
              <span className="dsr-label">{t("Link code from GitHub")}</span>
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
              <span className="dsr-label">{t("Link code from your computer")}</span>
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
              <span className="dsr-label">{t("Upload a .fig / .pen file")}</span>
              <span className="dsr-value">
                <input
                  ref={figRef}
                  type="file"
                  accept=".fig,.pen"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    try {
                      const ctx = await parseDesignFile(f);
                      setFigCtx(ctx.text);
                      setFigLabel(f.name);
                      setErr(null);
                    } catch (er) {
                      setErr(er instanceof Error ? er.message : String(er));
                    }
                  }}
                />
                {figLabel ? (
                  <span className="ctx-chip">
                    {figLabel}
                    <button onClick={() => { setFigCtx(null); setFigLabel(null); }}><XIcon size={10} /></button>
                  </span>
                ) : (
                  <button className="drop-zone" onClick={() => figRef.current?.click()}>
                    Drop .fig / .pen here or <u>browse</u>
                  </button>
                )}
              </span>
            </div>
            <p className="dsr-note">{t("Parsed locally in your browser — never uploaded.")}</p>
            <div className="dsr">
              <span className="dsr-label">{t("Add fonts, logos and assets")}</span>
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
            {t("Any other notes?")}
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
          <h1>{t("It will take a few minutes to generate your design system.")}</h1>
          <p className="muted">{t("You can step away. Keep the tab open in the background.")}</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 22 }}>
            <button className="btn" onClick={() => setStep("form")}>
              {t("← Back")}
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
