import { useEffect, useRef } from "react";

interface Props {
  html: string;
  title: string;
  fullscreen?: boolean;
  onExit: () => void;
}

// Present mode: dark shell; optional native fullscreen (user req #8).
export function PresentOverlay({ html, title, fullscreen, onExit }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  useEffect(() => {
    if (fullscreen && ref.current) {
      ref.current.requestFullscreen?.().catch(() => {});
      return () => {
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      };
    }
  }, [fullscreen]);

  return (
    <div className="present-overlay" ref={ref}>
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
