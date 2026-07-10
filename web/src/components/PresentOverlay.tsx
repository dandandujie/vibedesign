import { useEffect } from "react";

interface Props {
  html: string;
  title: string;
  onExit: () => void;
}

// Present mode: full-screen dark shell (--om-presenter-* tokens) with the
// artifact rendered clean (no inspector). Esc or the ✕ exits.
export function PresentOverlay({ html, title, onExit }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  return (
    <div className="present-overlay">
      <div className="present-bar">
        <span className="t">{title}</span>
        <button className="present-exit" onClick={onExit} title="退出演示 (Esc)">
          ✕
        </button>
      </div>
      <iframe title="present" srcDoc={html} sandbox="allow-scripts allow-same-origin allow-forms" />
    </div>
  );
}
