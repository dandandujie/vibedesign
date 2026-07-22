import { CSSProperties, useEffect, useRef, useState } from "react";
import { ArtifactVersion } from "../lib/types";
import { SiteManifest } from "../lib/artifact";
import { t } from "../lib/i18n";
import { PhoneFrame, PhoneShell, shellOuterDims } from "./PhoneFrame";

interface Props {
  projectId: string;
  version: ArtifactVersion; // kind === "multifile"
  // Site page management: edits (rename / reorder / delete / add) produce new
  // files + manifest; the host saves them as a manual version.
  onEditSite?: (files: Record<string, string>, site: SiteManifest) => void;
  device?: "web" | "mobile" | "app"; // phone-shell preview mode
  shell?: PhoneShell;
}

// Renders a multi-file artifact: a Preview tab (the entry served over /api/mf so
// its sibling files resolve) plus one source tab per file. Additive viewer — it
// never touches the single-file Canvas. The entry is fetched over the network,
// so we probe until the version has been persisted (avoids a load race).
//
// Site / flow prototypes (version.site from a ```vdsite block) additionally get:
//  - a page bar: one tab per manifest page; in-iframe navigation (relative
//    links) is tracked back into the bar so the active page follows clicks.
//  - an overview tab: live thumbnails of every page + flow chains.
//  - page management: rename / reorder / delete / add (saved as manual versions).
export function MultiFileViewer({ projectId, version, onEditSite, device = "web", shell = "iphone-dark" }: Props) {
  const files = version.files ?? {};
  const paths = Object.keys(files);
  const entry = version.entry && files[version.entry] ? version.entry : paths.find((p) => /\.html?$/i.test(p)) ?? paths[0] ?? "";
  const base = `/api/mf/${projectId}/${version.id}/`;

  // Manifest pages that actually exist in the file set, in manifest order.
  const sitePages = (version.site?.pages ?? []).filter((p) => files[p.path]);
  const flows = version.site?.flows ?? [];
  const isSite = sitePages.length > 0;

  // Adaptive overview grid (page-count driven):
  // 1 → fullscreen · 2 → halves (user toggles horizontal/vertical) · 3 → 3 cols ·
  // 4 → 2×2 · 5-6 → 3×2 · 7-9 → 3×3 · >9 → 3-col scroll.
  const [ovDir, setOvDir] = useState<"row" | "col">(() => (localStorage.getItem("vd_ov2dir") as "row" | "col") || "row");
  const n = sitePages.length;
  const gridStyle: CSSProperties =
    n <= 1
      ? { gridTemplateColumns: "1fr", gridTemplateRows: "1fr" }
      : n === 2
        ? ovDir === "row"
          ? { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr" }
          : { gridTemplateColumns: "1fr", gridTemplateRows: "1fr 1fr" }
        : n === 3
          ? { gridTemplateColumns: "repeat(3, 1fr)", gridTemplateRows: "1fr" }
          : n === 4
            ? { gridTemplateColumns: "repeat(2, 1fr)", gridTemplateRows: "repeat(2, 1fr)" }
            : n <= 6
              ? { gridTemplateColumns: "repeat(3, 1fr)", gridTemplateRows: "repeat(2, 1fr)" }
              : n <= 9
                ? { gridTemplateColumns: "repeat(3, 1fr)", gridTemplateRows: "repeat(3, 1fr)" }
                : { gridTemplateColumns: "repeat(3, 1fr)", gridAutoRows: "calc((100% - 28px) / 3)" };

  const [tab, setTab] = useState<string>("preview");
  const [page, setPage] = useState<string>(entry);
  const [ready, setReady] = useState(false);
  const [pageMenu, setPageMenu] = useState(false);
  const pageUrl = base + page;

  useEffect(() => {
    setTab("preview");
    setPage(entry);
    setPageMenu(false);
  }, [version.id, entry]);

  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    setReady(false);
    const probe = async () => {
      try {
        const r = await fetch(pageUrl, { cache: "no-store" });
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
  }, [pageUrl]);

  useEffect(() => {
    if (!pageMenu) return;
    const onDoc = () => setPageMenu(false);
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [pageMenu]);

  // Follow in-iframe navigation: clicking a relative link inside the preview
  // loads another page of the site — reflect that in the page bar.
  const syncPageFromIframe = (frame: HTMLIFrameElement) => {
    try {
      const path = frame.contentWindow?.location.pathname ?? "";
      const prefix = new URL(base, window.location.origin).pathname;
      if (path.startsWith(prefix)) {
        const rel = decodeURIComponent(path.slice(prefix.length));
        if (rel && files[rel] && rel !== page) setPage(rel);
      }
    } catch {
      /* cross-origin — should not happen (same-origin /api/mf) */
    }
  };

  // ---- page management -------------------------------------------------------
  const site = version.site;
  const applyEdit = (newFiles: Record<string, string>, newSite: SiteManifest) => {
    // keep site.json in sync with the manifest
    if (files["site.json"]) newFiles = { ...newFiles, "site.json": JSON.stringify(newSite, null, 2) + "\n" };
    onEditSite?.(newFiles, newSite);
    setPageMenu(false);
  };

  const renamePage = () => {
    if (!site) return;
    const cur = sitePages.find((p) => p.path === page);
    if (!cur) return;
    const title = window.prompt(t("页面标题"), cur.title);
    if (!title?.trim()) return;
    const pages = site.pages.map((p) => (p.path === cur.path ? { ...p, title: title.trim() } : p));
    applyEdit({ ...files }, { ...site, pages });
  };

  const movePage = (dir: -1 | 1) => {
    if (!site) return;
    const idx = site.pages.findIndex((p) => p.path === page);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= site.pages.length) return;
    const pages = [...site.pages];
    [pages[idx], pages[to]] = [pages[to], pages[idx]];
    applyEdit({ ...files }, { ...site, pages });
  };

  const deletePage = () => {
    if (!site || sitePages.length <= 1) return;
    const cur = sitePages.find((p) => p.path === page);
    if (!cur || !window.confirm(`${t("删除页面")}「${cur.title}」？`)) return;
    const newFiles = { ...files };
    delete newFiles[cur.path];
    const pages = site.pages.filter((p) => p.path !== cur.path);
    const newFlows = (site.flows ?? [])
      .map((f) => ({ ...f, steps: f.steps.filter((s) => s !== cur.path) }))
      .filter((f) => f.steps.length);
    applyEdit(newFiles, { pages, flows: newFlows });
  };

  const addPage = () => {
    if (!site) return;
    const title = window.prompt(t("新页面标题"), t("新页面"));
    if (!title?.trim()) return;
    const slug = title.trim().toLowerCase().replace(/[^a-z0-9一-龥]+/g, "-").replace(/^-+|-+$/g, "") || "page";
    let path = `${slug}.html`;
    let n = 2;
    while (files[path]) path = `${slug}-${n++}.html`;
    const stub = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.trim()}</title>
<link rel="stylesheet" href="./styles.css">
</head>
<body>
<main style="min-height:60vh;display:grid;place-items:center;padding:40px">
  <p style="color:#888">${t("占位页 — 在对话里说「完善 ")}${title.trim()}${t(" 页」让模型设计它")}</p>
</main>
</body>
</html>
`;
    const pages = [...site.pages, { path, title: title.trim() }];
    applyEdit({ ...files, [path]: stub }, { ...site, pages });
  };

  return (
    <div className="mf-viewer">
      {isSite && (
        <div className="mf-tabs mf-pages">
          <button
            className={`mf-tab ${tab === "overview" ? "on" : ""}`}
            onClick={() => setTab("overview")}
            title={t("站点概览（全部页面 + 流程）")}
          >
            ◈ {t("概览")}
          </button>
          {sitePages.map((p) => (
            <button
              key={p.path}
              className={`mf-tab ${tab === "preview" && page === p.path ? "on" : ""}`}
              onClick={() => {
                setPage(p.path);
                setTab("preview");
              }}
              title={p.path}
            >
              {p.title}
            </button>
          ))}
          {onEditSite && (
            <span className="mf-page-ops" onClick={(e) => e.stopPropagation()}>
              <button className="mf-tab mf-op" title={t("添加页面")} onClick={addPage}>
                ＋
              </button>
              <span style={{ position: "relative" }}>
                <button className="mf-tab mf-op" title={t("当前页操作")} onClick={() => setPageMenu((v) => !v)}>
                  ⋯
                </button>
                {pageMenu && (
                  <div className="mini-menu" style={{ left: 0, top: "calc(100% + 4px)" }}>
                    <button onClick={renamePage}>{t("重命名标题")}</button>
                    <button onClick={() => movePage(-1)}>{t("左移")}</button>
                    <button onClick={() => movePage(1)}>{t("右移")}</button>
                    <div className="pm-sep" />
                    <button className="danger" onClick={deletePage} disabled={sitePages.length <= 1}>
                      {t("删除页面")}
                    </button>
                  </div>
                )}
              </span>
            </span>
          )}
        </div>
      )}
      <div className="mf-tabs">
        <button className={`mf-tab ${tab === "preview" || tab === "overview" ? "on" : ""}`} onClick={() => setTab("preview")}>
          ▶ {t("预览")}
        </button>
        {paths.map((p) => (
          <button key={p} className={`mf-tab ${tab === p ? "on" : ""}`} onClick={() => setTab(p)} title={p}>
            {p === entry ? "★ " : ""}
            {p}
          </button>
        ))}
      </div>
      <div className="mf-body">
        {tab === "overview" && isSite ? (
          <div className="mf-overview">
            {n === 2 && (
              <div className="mf-ov-dir">
                <button
                  className={ovDir === "row" ? "on" : ""}
                  title={t("左右各一半")}
                  onClick={() => {
                    setOvDir("row");
                    localStorage.setItem("vd_ov2dir", "row");
                  }}
                >
                  ⇋ {t("左右")}
                </button>
                <button
                  className={ovDir === "col" ? "on" : ""}
                  title={t("上下各一半")}
                  onClick={() => {
                    setOvDir("col");
                    localStorage.setItem("vd_ov2dir", "col");
                  }}
                >
                  ⇅ {t("上下")}
                </button>
              </div>
            )}
            <div className="mf-ov-grid" style={gridStyle}>
              {sitePages.map((p, i) => (
                <BoardCell
                  key={p.path}
                  src={base + p.path}
                  title={p.title}
                  path={p.path}
                  index={i}
                  device={device}
                  shell={shell}
                  onOpen={() => {
                    setPage(p.path);
                    setTab("preview");
                  }}
                />
              ))}
            </div>
          </div>
        ) : tab === "preview" ? (
          ready ? (
            device !== "web" ? (
              <div className="mf-phone-stage">
                <PhoneFrame shell={shell}>
                  <iframe
                    className="mf-frame"
                    src={pageUrl}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-pointer-lock"
                    title="multi-file preview"
                    onLoad={(e) => syncPageFromIframe(e.currentTarget)}
                  />
                </PhoneFrame>
              </div>
            ) : (
              <iframe
                className="mf-frame"
                src={pageUrl}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-pointer-lock"
                title="multi-file preview"
                onLoad={(e) => syncPageFromIframe(e.currentTarget)}
              />
            )
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

// One adaptive-grid cell: a live page preview (phone shell or bare iframe)
// scaled to fill the cell, with a title chip. Click opens the page.
function BoardCell({
  src,
  title,
  path,
  index,
  device,
  shell,
  onOpen,
}: {
  src: string;
  title: string;
  path: string;
  index: number;
  device: "web" | "mobile" | "app";
  shell: PhoneShell;
  onOpen: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  const dims = device !== "web" ? shellOuterDims(shell) : { w: 1100, h: 760 };

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(el.clientWidth / dims.w, el.clientHeight / dims.h));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [dims.w, dims.h]);

  return (
    <div className="mf-cell" role="button" tabIndex={0} onClick={onOpen}>
      <div className="mf-cell-stage" ref={stageRef}>
        <div style={{ width: dims.w * scale, height: dims.h * scale, position: "relative" }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: dims.w, height: dims.h }}>
            {device !== "web" ? (
              <PhoneFrame shell={shell}>
                <iframe className="mf-board-live" src={src} sandbox="allow-scripts allow-same-origin" tabIndex={-1} title={title} />
              </PhoneFrame>
            ) : (
              <iframe className="mf-cell-frame" src={src} sandbox="allow-scripts allow-same-origin" tabIndex={-1} title={title} />
            )}
          </div>
        </div>
      </div>
      <span className="mf-cell-title">
        {index + 1} · {title}
        <span className="p">{path}</span>
      </span>
    </div>
  );
}
