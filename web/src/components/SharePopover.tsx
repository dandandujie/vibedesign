import { useEffect, useRef, useState } from "react";
import { t } from "../lib/i18n";
import { clampPop } from "../lib/popover";
import { buildDesignManifest, buildHandoffMd } from "../lib/handoff";

interface Props {
  artifactHtml: string | null;
  projectName: string;
  exportPng?: (selector: string | null, scale: number) => Promise<string | null>;
}

// Share popover per field study §9: access section + Copy link, then an
// Export list (PDF / Standalone HTML / PowerPoint / More formats).
export function SharePopover({ artifactHtml, projectName, exportPng }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const safe = (projectName || "design").replace(/[^\w一-龥-]+/g, "-");

  const download = (name: string, content: string | Blob, type = "text/html") => {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

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

  const exportVideo = async () => {
    if (!artifactHtml) return;
    setBusy("video");
    try {
      const r = await fetch("/api/render-motion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ html: artifactHtml, fps: 30, width: 1280, height: 720, format: "mp4" }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? "渲染失败");
      }
      download(`${safe}.mp4`, await r.blob(), "video/mp4");
    } catch (e) {
      alert(`视频导出失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
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

  const exportBundle = async () => {
    if (!artifactHtml) return;
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("index.html", artifactHtml);
    zip.file("DESIGN-HANDOFF.md", buildHandoffMd(artifactHtml, projectName));
    zip.file("DESIGN-MANIFEST.json", JSON.stringify(buildDesignManifest(artifactHtml, projectName), null, 2));
    download(`${safe}-handoff.zip`, await zip.generateAsync({ type: "blob" }), "application/zip");
  };

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
          <button className="export-item" onClick={exportVideo} disabled={!artifactHtml || busy === "video"}>
            <span className="ic">🎬</span>
            <span className="tx">
              <span className="t">{t("Video (MP4)")}</span>
              <span className="d">{busy === "video" ? "渲染中…（无头逐帧）" : "Render the animation as MP4"}</span>
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
