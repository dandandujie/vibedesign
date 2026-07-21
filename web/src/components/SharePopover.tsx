import { useEffect, useRef, useState } from "react";
import { t } from "../lib/i18n";
import { clampPop } from "../lib/popover";
import { download, exportHandoffZip, exportSiteZip, safeName } from "../lib/exporters";
import { ArtifactVersion } from "../lib/types";

interface Props {
  artifactHtml: string | null;
  projectName: string;
  version?: ArtifactVersion | null; // active version — enables the site ZIP export for multifile/site artifacts
  exportPng?: (selector: string | null, scale: number) => Promise<string | null>;
}

// Share popover per field study §9: access section + Copy link, then an
// Export list (PDF / Standalone HTML / PowerPoint / More formats).
export function SharePopover({ artifactHtml, projectName, version, exportPng }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoOpts, setVideoOpts] = useState({ fps: 30, size: "1280x720", format: "mp4" as "mp4" | "webm" });
  const [videoProgress, setVideoProgress] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const safe = safeName(projectName);

  // Prefer the native save dialog (Chromium); fall back to a plain download.
  const saveDataUrl = async (name: string, dataUrl: string) => {
    const blob = await (await fetch(dataUrl)).blob();
    const picker = (window as unknown as {
      showSaveFilePicker?: (o: unknown) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }>;
    }).showSaveFilePicker;
    if (picker) {
      try {
        const handle = await picker({ suggestedName: name, types: [{ description: "PNG image", accept: { "image/png": [".png"] } }] });
        const w = await handle.createWritable();
        await w.write(blob);
        await w.close();
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return; // user cancelled
      }
    }
    download(name, blob, "image/png");
  };

  const copyImage = async (dataUrl: string) => {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard image write unsupported */
    }
  };

  const exportMd = () => {
    if (!artifactHtml) return;
    download(`${safe}.md`, "```html\n" + artifactHtml + "\n```\n", "text/markdown");
  };

  // Pixel-perfect export via the server's headless Chromium (real fonts / WebGL /
  // CJK) — beats the client screenshot for decks and font-heavy designs.
  const exportPixel = async (format: "png" | "pdf") => {
    if (!artifactHtml) return;
    setBusy(format === "pdf" ? "pxpdf" : "pxpng");
    try {
      const r = await fetch("/api/render-screenshot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ html: artifactHtml, format, width: 1280, scale: 2 }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "渲染失败");
      download(`${safe}.${format}`, await r.blob(), format === "pdf" ? "application/pdf" : "image/png");
    } catch (e) {
      alert(`像素级导出失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const exportVideo = async () => {
    if (!artifactHtml) return;
    setBusy("video");
    setVideoProgress(null);
    try {
      const [vw, vh] = videoOpts.size.split("x").map(Number);
      const r = await fetch("/api/render-motion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ html: artifactHtml, stream: true, fps: videoOpts.fps, width: vw, height: vh, format: videoOpts.format }),
      });
      if (!r.ok || !r.body) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? "渲染失败");
      }
      // SSE stream: per-frame progress events, then a base64 result event.
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let gotResult = false;
      while (true) {
        const { done, value } = await reader.read();
        buf += done ? decoder.decode() : decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const evt = JSON.parse(line.slice(5));
          if (evt.type === "progress") setVideoProgress(`${evt.frame}/${evt.total}`);
          else if (evt.type === "error") throw new Error(evt.error ?? "渲染失败");
          else if (evt.type === "result") {
            const blob = await (await fetch(`data:video/${evt.format};base64,${evt.data}`)).blob();
            download(`${safe}.${evt.format}`, blob, `video/${evt.format}`);
            gotResult = true;
          }
        }
        if (done) break;
      }
      if (!gotResult) throw new Error("渲染未返回结果");
      setVideoOpen(false);
    } catch (e) {
      alert(`视频导出失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
      setVideoProgress(null);
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const exportPdf = () => {
    if (!artifactHtml) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(artifactHtml);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  const exportBundle = () => artifactHtml && exportHandoffZip(artifactHtml, projectName);

  // Multi-page site / flow prototype: zip every file as-is plus a site manifest
  // (pages + flows + shared tokens) and an agent-facing handoff brief.
  const exportSite = () => version && exportSiteZip(version, projectName);

  return (
    <div className="share-wrap" ref={ref}>
      <button className="share-btn" onClick={() => setOpen((v) => !v)}>
        ↗ {t("Share")}
      </button>
      {open && (
        <div className="share-pop" ref={clampPop}>
          <div className="access">
            <span className="sec-label">{t("Who can access")}</span>
            <select defaultValue="local">
              <option value="local">{t("本机（local）")}</option>
              <option value="lan" disabled>
                {t("局域网链接（即将支持）")}
              </option>
            </select>
            <span className="hint">{t("Only you can see this design.")}</span>
          </div>
          <div className="copy-row">
            <button className="btn black small" onClick={copyLink}>
              {copied ? `✓ ${t("Copied")}` : `🔗 ${t("Copy link")}`}
            </button>
          </div>

          <span className="sec-label">{t("Export")}</span>
          <button className="export-item" onClick={exportPdf} disabled={!artifactHtml}>
            <span className="ic">📄</span>
            <span className="tx">
              <span className="t">PDF</span>
              <span className="d">{t("Original size")}</span>
            </span>
            <span className="go">{t("Download")}</span>
          </button>
          <button
            className="export-item"
            onClick={() => artifactHtml && download(`${safe}.html`, artifactHtml)}
            disabled={!artifactHtml}
          >
            <span className="ic">🌐</span>
            <span className="tx">
              <span className="t">{t("Standalone HTML")}</span>
              <span className="d">{t("One self-contained file")}</span>
            </span>
            <span className="go">{t("Download")}</span>
          </button>
          <button className="export-item" onClick={exportBundle} disabled={!artifactHtml}>
            <span className="ic">🤝</span>
            <span className="tx">
              <span className="t">{t("Claude Code bundle")}</span>
              <span className="d">{t("index.html + HANDOFF.md + MANIFEST.json")}</span>
            </span>
            <span className="go">{t("Download")}</span>
          </button>
          {version?.kind === "multifile" && version.files && (
            <button className="export-item" onClick={exportSite}>
              <span className="ic">🗂</span>
              <span className="tx">
                <span className="t">{t("站点 ZIP")}</span>
                <span className="d">{t("全部页面文件 + SITE-MANIFEST.json")}</span>
              </span>
              <span className="go">{t("Download")}</span>
            </button>
          )}
          <button className="export-item" onClick={exportMd} disabled={!artifactHtml}>
            <span className="ic">📝</span>
            <span className="tx">
              <span className="t">Markdown</span>
              <span className="d">{t("Source in a fenced block, for an LLM")}</span>
            </span>
            <span className="go">{t("Download")}</span>
          </button>
          <button
            className="export-item"
            disabled={!artifactHtml || !exportPng || busy === "pptx"}
            onClick={async () => {
              if (!exportPng) return;
              setBusy("pptx");
              try {
                const img = await exportPng(null, 2);
                if (img) {
                  const { default: pptxgen } = await import("pptxgenjs");
                  const pptx = new pptxgen();
                  pptx.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
                  pptx.layout = "WIDE";
                  const slide = pptx.addSlide();
                  slide.addImage({ data: img, x: 0, y: 0, w: 13.33, h: 7.5, sizing: { type: "contain", w: 13.33, h: 7.5 } });
                  await pptx.writeFile({ fileName: `${safe}.pptx` });
                }
              } finally {
                setBusy(null);
              }
            }}
          >
            <span className="ic">📽</span>
            <span className="tx">
              <span className="t">{t("PowerPoint")}</span>
              <span className="d">{busy === "pptx" ? "生成中…" : "Design as full-slide image"}</span>
            </span>
            <span className="go">{t("Download")}</span>
          </button>
          <button
            className="export-item"
            disabled={!artifactHtml || !exportPng || busy === "png"}
            onClick={async () => {
              if (!exportPng) return;
              setBusy("png");
              try {
                const img = await exportPng(null, 2);
                if (img) await saveDataUrl(`${safe}.png`, img);
              } finally {
                setBusy(null);
              }
            }}
          >
            <span className="ic">🖼</span>
            <span className="tx">
              <span className="t">{t("PNG image")}</span>
              <span className="d">{busy === "png" ? "生成中…" : "Full design at 2×"}</span>
            </span>
            <span className="go">{t("Save")}</span>
          </button>
          <button
            className="export-item"
            disabled={!artifactHtml || !exportPng || busy === "copy"}
            onClick={async () => {
              if (!exportPng) return;
              setBusy("copy");
              try {
                const img = await exportPng(null, 2);
                if (img) await copyImage(img);
              } finally {
                setBusy(null);
              }
            }}
          >
            <span className="ic">📋</span>
            <span className="tx">
              <span className="t">{t("Copy image")}</span>
              <span className="d">{busy === "copy" ? "生成中…" : copied ? t("Copied") : "PNG to clipboard"}</span>
            </span>
            <span className="go">{copied ? "✓" : t("Copy")}</span>
          </button>
          <button
            className="export-item"
            onClick={() => !busy && setVideoOpen((v) => !v)}
            disabled={!artifactHtml || busy === "video"}
          >
            <span className="ic">🎬</span>
            <span className="tx">
              <span className="t">{t("Video")}</span>
              <span className="d">
                {busy === "video" ? `渲染中…${videoProgress ? ` ${videoProgress}` : ""}` : t("MP4/WebM · 可选帧率与尺寸")}
              </span>
            </span>
            <span className="go">{videoOpen ? "▴" : "▾"}</span>
          </button>
          {videoOpen && busy !== "video" && (
            <div className="video-opts">
              <label>
                {t("帧率")}
                <select value={videoOpts.fps} onChange={(e) => setVideoOpts((o) => ({ ...o, fps: Number(e.target.value) }))}>
                  <option value={24}>24 fps</option>
                  <option value={30}>30 fps</option>
                  <option value={60}>60 fps</option>
                </select>
              </label>
              <label>
                {t("尺寸")}
                <select value={videoOpts.size} onChange={(e) => setVideoOpts((o) => ({ ...o, size: e.target.value }))}>
                  <option value="1280x720">1280 × 720</option>
                  <option value="1920x1080">1920 × 1080</option>
                  <option value="1080x1920">1080 × 1920（竖屏）</option>
                </select>
              </label>
              <label>
                {t("格式")}
                <select value={videoOpts.format} onChange={(e) => setVideoOpts((o) => ({ ...o, format: e.target.value as "mp4" | "webm" }))}>
                  <option value="mp4">MP4</option>
                  <option value="webm">WebM</option>
                </select>
              </label>
              <button className="btn black small" onClick={exportVideo}>
                {t("开始渲染")}
              </button>
            </div>
          )}
          <button className="export-item" onClick={() => exportPixel("png")} disabled={!artifactHtml || busy === "pxpng"}>
            <span className="ic">🖼</span>
            <span className="tx">
              <span className="t">{t("PNG（像素级）")}</span>
              <span className="d">{busy === "pxpng" ? "渲染中…（无头 Chromium）" : "Headless render — real fonts / WebGL"}</span>
            </span>
            <span className="go">{t("Download")}</span>
          </button>
          <button className="export-item" onClick={() => exportPixel("pdf")} disabled={!artifactHtml || busy === "pxpdf"}>
            <span className="ic">📄</span>
            <span className="tx">
              <span className="t">{t("PDF（像素级）")}</span>
              <span className="d">{busy === "pxpdf" ? "渲染中…（无头 Chromium）" : "Print-perfect PDF (handles CJK)"}</span>
            </span>
            <span className="go">{t("Download")}</span>
          </button>
          <button className="export-item" disabled>
            <span className="ic">⋯</span>
            <span className="tx">
              <span className="t">{t("More apps")}</span>
              <span className="d">Canva · Vercel · Figma（即将支持）</span>
            </span>
            <span className="go">›</span>
          </button>
        </div>
      )}
    </div>
  );
}
