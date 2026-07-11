import { useEffect, useState } from "react";
import { ArtifactVersion } from "../lib/types";

interface Props {
  projectId: string;
  version: ArtifactVersion; // kind === "multifile"
}

// Renders a multi-file artifact: a Preview tab (the entry served over /api/mf so
// its sibling files resolve) plus one source tab per file. Additive viewer — it
// never touches the single-file Canvas. The entry is fetched over the network,
// so we probe until the version has been persisted (avoids a load race).
export function MultiFileViewer({ projectId, version }: Props) {
  const files = version.files ?? {};
  const paths = Object.keys(files);
  const entry = version.entry && files[version.entry] ? version.entry : paths.find((p) => /\.html?$/i.test(p)) ?? paths[0] ?? "";
  const base = `/api/mf/${projectId}/${version.id}/`;
  const entryUrl = base + entry;

  const [tab, setTab] = useState<string>("preview");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setTab("preview");
  }, [version.id]);

  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    setReady(false);
    const probe = async () => {
      try {
        const r = await fetch(entryUrl, { cache: "no-store" });
        if (r.ok) {
          if (!cancelled) setReady(true);
          return;
        }
      } catch {
        /* server not ready yet */
      }
      if (!cancelled && tries++ < 12) setTimeout(probe, 250);
    };
    probe();
    return () => {
      cancelled = true;
    };
  }, [entryUrl]);

  return (
    <div className="mf-viewer">
      <div className="mf-tabs">
        <button className={`mf-tab ${tab === "preview" ? "on" : ""}`} onClick={() => setTab("preview")}>
          ▶ 预览
        </button>
        {paths.map((p) => (
          <button key={p} className={`mf-tab ${tab === p ? "on" : ""}`} onClick={() => setTab(p)} title={p}>
            {p === entry ? "★ " : ""}
            {p}
          </button>
        ))}
      </div>
      <div className="mf-body">
        {tab === "preview" ? (
          ready ? (
            <iframe
              className="mf-frame"
              src={entryUrl}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-pointer-lock"
              title="multi-file preview"
            />
          ) : (
            <div className="mf-loading">正在准备多文件预览…</div>
          )
        ) : (
          <pre className="mf-code">
            <code>{files[tab]}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
