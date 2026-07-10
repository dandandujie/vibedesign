// Thin-line SVG icon set (feather-style, 1.7px stroke) — replaces every
// text-glyph icon per user feedback ("所有向下箭头都非常丑").

import { SVGProps } from "react";

function I({ children, size = 16, ...rest }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const ChevronDown = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <I {...p}>
    <polyline points="6 9 12 15 18 9" />
  </I>
);
export const ChevronRight = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <I {...p}>
    <polyline points="9 6 15 12 9 18" />
  </I>
);
export const PanelLeft = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <I {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <line x1="9.5" y1="4" x2="9.5" y2="20" />
  </I>
);
export const HistoryIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <I {...p}>
    <path d="M4 8.5A9 9 0 1 1 3 12" />
    <polyline points="4 4 4 8.5 8.5 8.5" />
    <polyline points="12 8 12 12 15 14" />
  </I>
);
export const MoreHorizontal = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <I {...p}>
    <circle cx="5" cy="12" r="0.8" fill="currentColor" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" />
    <circle cx="19" cy="12" r="0.8" fill="currentColor" />
  </I>
);
export const XIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <I {...p}>
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </I>
);
export const PlusIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <I {...p}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </I>
);
export const ArrowUp = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <I {...p}>
    <line x1="12" y1="19" x2="12" y2="6" />
    <polyline points="6 12 12 6 18 12" />
  </I>
);
export const RefreshIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <I {...p}>
    <path d="M20 8.5A9 9 0 1 0 21 12" />
    <polyline points="20 4 20 8.5 15.5 8.5" />
  </I>
);
export const ExternalLink = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <I {...p}>
    <path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
    <polyline points="14 4 20 4 20 10" />
    <line x1="10" y1="14" x2="20" y2="4" />
  </I>
);
export const LinkIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <I {...p}>
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </I>
);
export const StarIcon = (p: SVGProps<SVGSVGElement> & { size?: number; filled?: boolean }) => (
  <I {...p} fill={p.filled ? "currentColor" : "none"}>
    <polygon points="12 3 14.9 8.9 21.4 9.8 16.7 14.4 17.8 20.9 12 17.8 6.2 20.9 7.3 14.4 2.6 9.8 9.1 8.9" />
  </I>
);
export const CopyIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <I {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </I>
);
export const PencilIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <I {...p}>
    <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
  </I>
);
export const TrashIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <I {...p}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </I>
);
export const StopIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <I {...p}>
    <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />
  </I>
);

// ---- edit toolbar ------------------------------------------------------------

export const CursorIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <I {...p} fill="currentColor" strokeWidth="1.4">
    <path d="M5 3l7 16 2.2-6.2L20.5 10z" />
  </I>
);
export const ClickThroughIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <I {...p}>
    <path d="M8 5l5.5 12.5 1.7-4.8 5-1.7z" fill="currentColor" stroke="none" />
    <path d="M4 3.5v3M2.5 5h3" />
  </I>
);
export const TextIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <I {...p}>
    <line x1="5" y1="5" x2="19" y2="5" />
    <line x1="12" y1="5" x2="12" y2="19" />
  </I>
);
export const FrameIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <I {...p}>
    <line x1="7" y1="3" x2="7" y2="21" />
    <line x1="17" y1="3" x2="17" y2="21" />
    <line x1="3" y1="7" x2="21" y2="7" />
    <line x1="3" y1="17" x2="21" y2="17" />
  </I>
);
export const RectIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <I {...p}>
    <rect x="4" y="6" width="16" height="12" rx="1.5" />
  </I>
);
export const OvalIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <I {...p}>
    <circle cx="12" cy="12" r="8" />
  </I>
);
export const ArrowNE = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <I {...p}>
    <line x1="6" y1="18" x2="18" y2="6" />
    <polyline points="10 6 18 6 18 14" />
  </I>
);
export const LineIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <I {...p}>
    <line x1="5" y1="19" x2="19" y2="5" />
  </I>
);
export const DrawIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <I {...p}>
    <path d="M12 19c-3 1.5-6 1.5-8 0 2-4 5-4 7-6s2-5 5-7c2.5-1.7 5 .8 3.3 3.3-2 3-5 3-7 5" />
  </I>
);
export const UndoIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <I {...p}>
    <path d="M8 6L4 10l4 4" />
    <path d="M4 10h10a5 5 0 0 1 0 10h-3" />
  </I>
);
export const RedoIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <I {...p}>
    <path d="M16 6l4 4-4 4" />
    <path d="M20 10H10a5 5 0 0 0 0 10h3" />
  </I>
);

// ---- app badge (Image 12: white rounded card with the orange mark) -------------

export function AppBadge({ onClick, title }: { onClick?: () => void; title?: string }) {
  return (
    <button className="app-badge" onClick={onClick} title={title}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 3.5c4.7 0 8.5 3.4 8.5 7.6 0 2.6-1.6 4.2-3.8 4.2h-2c-1 0-1.6.7-1.3 1.6.2.6.1 1.3-.4 1.9-.9 1-2.6 1.2-4 .6-3.2-1.3-5.5-4.4-5.5-8.3 0-4.2 3.8-7.6 8.5-7.6z"
          stroke="#d97757"
          strokeWidth="1.9"
        />
        <circle cx="8.6" cy="9.4" r="1.15" fill="#d97757" />
        <circle cx="12.8" cy="7.6" r="1.15" fill="#d97757" />
        <circle cx="16" cy="10.6" r="1.15" fill="#d97757" />
      </svg>
    </button>
  );
}
