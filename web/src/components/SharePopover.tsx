import { useEffect, useRef, useState } from "react";

interface Props {
  artifactHtml: string | null;
  projectName: string;
}

// Share popover per field study §9: access section + Copy link, then an
// Export list (PDF / Standalone HTML / PowerPoint / More formats).
export function SharePopover({ artifactHtml, projectName }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
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
          <button className="export-item" disabled>
            <span className="ic">📽</span>
            <span className="tx">
              <span className="t">PowerPoint</span>
              <span className="d">即将支持</span>
            </span>
            <span className="go">›</span>
          </button>
          <button className="export-item" disabled>
            <span className="ic">⋯</span>
            <span className="tx">
              <span className="t">More formats and apps</span>
              <span className="d">Canva · Vercel · Figma（即将支持）</span>
            </span>
            <span className="go">›</span>
          </button>
        </div>
      )}
    </div>
  );
}
