import { useEffect, useRef, useState } from "react";

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
    zip.file("design.html", artifactHtml);
    zip.file(
      "README.md",
      `# ${projectName} — design handoff\n\nSelf-contained HTML design from Vibedesign.\n\n` +
        `## For a coding agent\n\nConvert \`design.html\` into the project's framework preserving layout, spacing, typography and interaction states exactly.\n`,
    );
    download(`${safe}-handoff.zip`, await zip.generateAsync({ type: "blob" }), "application/zip");
  };

  return (
    <div className="share-wrap" ref={ref}>
      <button className="share-btn" onClick={() => setOpen((v) => !v)}>
        ↗ Share
      </button>
      {open && (
        <div className="share-pop">
          <div className="access">
            <span className="sec-label">Who can access</span>
            <select defaultValue="local">
              <option value="local">本机（local）</option>
              <option value="lan" disabled>
                局域网链接（即将支持）
              </option>
            </select>
            <span className="hint">Only you can see this design.</span>
          </div>
          <div className="copy-row">
            <button className="btn black small" onClick={copyLink}>
              {copied ? "✓ Copied" : "🔗 Copy link"}
            </button>
          </div>

          <span className="sec-label">Export</span>
          <button className="export-item" onClick={exportPdf} disabled={!artifactHtml}>
            <span className="ic">📄</span>
            <span className="tx">
              <span className="t">PDF</span>
              <span className="d">Original size</span>
            </span>
            <span className="go">Download</span>
          </button>
          <button
            className="export-item"
            onClick={() => artifactHtml && download(`${safe}.html`, artifactHtml)}
            disabled={!artifactHtml}
          >
            <span className="ic">🌐</span>
            <span className="tx">
              <span className="t">Standalone HTML</span>
              <span className="d">One self-contained file</span>
            </span>
            <span className="go">Download</span>
          </button>
          <button className="export-item" onClick={exportBundle} disabled={!artifactHtml}>
            <span className="ic">🤝</span>
            <span className="tx">
              <span className="t">Claude Code bundle</span>
              <span className="d">design.html + README for a coding agent</span>
            </span>
            <span className="go">Download</span>
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
              <span className="t">PowerPoint</span>
              <span className="d">{busy === "pptx" ? "生成中…" : "Design as full-slide image"}</span>
            </span>
            <span className="go">Download</span>
          </button>
          <button
            className="export-item"
            disabled={!artifactHtml || !exportPng || busy === "png"}
            onClick={async () => {
              if (!exportPng) return;
              setBusy("png");
              try {
                const img = await exportPng(null, 2);
                if (img) {
                  const a = document.createElement("a");
                  a.href = img;
                  a.download = `${safe}.png`;
                  a.click();
                }
              } finally {
                setBusy(null);
              }
            }}
          >
            <span className="ic">🖼</span>
            <span className="tx">
              <span className="t">PNG image</span>
              <span className="d">{busy === "png" ? "生成中…" : "Full design at 2×"}</span>
            </span>
            <span className="go">Download</span>
          </button>
          <button className="export-item" disabled>
            <span className="ic">⋯</span>
            <span className="tx">
              <span className="t">More apps</span>
              <span className="d">Canva · Vercel · Figma（即将支持）</span>
            </span>
            <span className="go">›</span>
          </button>
        </div>
      )}
    </div>
  );
}
