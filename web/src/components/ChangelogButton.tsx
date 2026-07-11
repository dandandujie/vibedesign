import { useEffect, useRef, useState } from "react";
import { t } from "../lib/i18n";
import { fetchVersion } from "../lib/api";
import { clampPop } from "../lib/popover";

const REPO = "dandandujie/vibedesign";

interface Release {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
}

declare global {
  interface Window {
    vd?: {
      installUpdate: () => void;
      onUpdateStatus: (cb: (s: string) => void) => void;
    };
  }
}

// strip markdown noise from generate-notes bodies (links, bold, PR URLs)
function cleanNotes(body: string): string {
  return body
    .replace(/\*\*Full Changelog\*\*.*$/ms, "")
    .replace(/by @[\w-]+ in https?:\/\/\S+/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 500);
}

function newer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}

// 更新日志 button (user req #12): pulses when GitHub has a newer release;
// card lists release notes; the update button auto-installs (Electron) or
// opens the release page (web).
export function ChangelogButton() {
  const [open, setOpen] = useState(false);
  const [releases, setReleases] = useState<Release[]>([]);
  const [current, setCurrent] = useState("0.0.0");
  const [hasNew, setHasNew] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const v = await fetchVersion();
      setCurrent(v);
      try {
        const rs: Release[] = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=6`, { cache: "no-store" }).then((r) =>
          r.ok ? r.json() : [],
        );
        setReleases(rs);
        setHasNew(!!rs[0] && newer(rs[0].tag_name, v));
      } catch {
        /* offline is fine */
      }
    })();
    window.vd?.onUpdateStatus?.((s) => setUpdating(s));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const update = () => {
    if (window.vd) {
      setUpdating(t("开始下载…"));
      window.vd.installUpdate();
    } else if (releases[0]) {
      window.open(releases[0].html_url, "_blank");
    }
  };

  return (
    <div className="changelog-wrap" ref={ref}>
      <button className={`btn ghost small ${hasNew ? "pulse-new" : ""}`} onClick={() => setOpen((v) => !v)}>
        {t("更新日志")}{hasNew ? " ●" : ""}
      </button>
      {open && (
        <div className="changelog-pop" ref={clampPop}>
          <div className="cl-head">
            <span>{t("更新日志")}</span>
            <span className="muted small">{t("当前")} v{current}</span>
          </div>
          {hasNew && (
            <div className="cl-update">
              <span>
                {t("新版本")} <strong>{releases[0]?.tag_name}</strong> {t("可用")}
              </span>
              <button className="btn primary small" disabled={!!updating} onClick={update}>
                {updating ?? (window.vd ? t("自动更新并重启") : t("去下载"))}
              </button>
            </div>
          )}
          <div className="cl-list">
            {releases.length === 0 && <p className="muted small">{t("暂无发布记录（或无法访问 GitHub）。")}</p>}
            {releases.map((r) => (
              <div key={r.tag_name} className="cl-item">
                <div className="cl-tag">
                  {r.tag_name} <span className="muted small">{r.published_at?.slice(0, 10)}</span>
                </div>
                <div className="cl-body">{cleanNotes(r.body || r.name || "")}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
