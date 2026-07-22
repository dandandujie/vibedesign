import { CSSProperties, ReactNode } from "react";

// Host-side device shells for the mobile / mobile-app preview modes. The base
// iPhone CSS is adapted from the open-design mobile-app seed (Apache-2.0,
// already ported to server/brain/skill-seeds/mobile-app.html). Unlike the seed
// (which bakes the frame INTO an artifact), this wraps any canvas content so
// every design gets a real-device look in preview — several device types and
// sizes, user-selectable (choice persisted in localStorage).

export type PhoneShell = "iphone-dark" | "iphone-light" | "android" | "se" | "tablet" | "minimal";

export interface ShellSpec {
  id: PhoneShell;
  label: string;
  w: number; // logical screen width (px)
  h: number; // logical screen height (px)
}

export const SHELL_OPTIONS: ShellSpec[] = [
  { id: "iphone-dark", label: "iPhone · 深色", w: 390, h: 844 },
  { id: "iphone-light", label: "iPhone · 浅色", w: 390, h: 844 },
  { id: "android", label: "Android · Pixel", w: 412, h: 891 },
  { id: "se", label: "iPhone SE · 小屏", w: 320, h: 568 },
  { id: "tablet", label: "iPad · 平板", w: 834, h: 1112 },
  { id: "minimal", label: "简约边框", w: 390, h: 844 },
];

// Back-compat with the first shell implementation's stored values.
export function normalizeShell(s: string | null): PhoneShell {
  if (s === "dark") return "iphone-dark";
  if (s === "light") return "iphone-light";
  return SHELL_OPTIONS.some((o) => o.id === s) ? (s as PhoneShell) : "iphone-dark";
}

export function shellSpec(id: PhoneShell): ShellSpec {
  return SHELL_OPTIONS.find((o) => o.id === id) ?? SHELL_OPTIONS[0];
}

const BEZEL: Record<PhoneShell, number> = {
  "iphone-dark": 12,
  "iphone-light": 12,
  android: 10,
  se: 14,
  tablet: 22,
  minimal: 6,
};

// Outer dimensions (screen + bezel) — used by fit-to-cell scaling in boards.
export function shellOuterDims(shell: PhoneShell): { w: number; h: number } {
  const spec = shellSpec(shell);
  const b = BEZEL[shell];
  return { w: spec.w + b * 2, h: spec.h + b * 2 };
}

export function PhoneFrame({ shell = "iphone-dark", children }: { shell?: PhoneShell; children: ReactNode }) {
  const spec = shellSpec(shell);
  const bezel = BEZEL[shell];
  const style: CSSProperties = {
    width: spec.w + bezel * 2,
    height: spec.h + bezel * 2,
    padding: bezel,
  };
  const island = shell === "iphone-dark" || shell === "iphone-light";
  return (
    <div className={`vd-phone shell-${shell}`} style={style}>
      {island && (
        <>
          <span className="vd-phone-btn left-1" />
          <span className="vd-phone-btn left-2" />
          <span className="vd-phone-btn left-3" />
          <span className="vd-phone-btn right-1" />
          <div className="vd-phone-island" />
        </>
      )}
      {shell === "android" && <div className="vd-phone-punch" />}
      {shell === "tablet" && <div className="vd-phone-tablet-cam" />}
      {shell === "se" && <div className="vd-phone-home-btn" />}
      <div className="vd-phone-screen">{children}</div>
    </div>
  );
}
