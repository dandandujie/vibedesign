import { ReactNode } from "react";

// Host-side phone shell for the mobile / mobile-app preview modes. The base
// CSS is adapted from the open-design mobile-app seed (Apache-2.0, already
// ported to server/brain/skill-seeds/mobile-app.html) — pure CSS bezel: metal
// body, side rails, hardware buttons, Dynamic Island. Unlike the seed (which
// bakes the frame INTO an artifact), this wraps any canvas content so every
// design gets the phone look in preview. Four selectable shells below.

export type PhoneShell = "dark" | "light" | "android" | "minimal";

export const SHELL_OPTIONS: { id: PhoneShell; label: string }[] = [
  { id: "dark", label: "iPhone 深色" },
  { id: "light", label: "iPhone 浅色" },
  { id: "android", label: "Android" },
  { id: "minimal", label: "简约边框" },
];

export function PhoneFrame({ shell = "dark", children }: { shell?: PhoneShell; children: ReactNode }) {
  const hardware = shell === "dark" || shell === "light";
  return (
    <div className={`vd-phone shell-${shell}`}>
      {hardware && (
        <>
          <span className="vd-phone-btn left-1" />
          <span className="vd-phone-btn left-2" />
          <span className="vd-phone-btn left-3" />
          <span className="vd-phone-btn right-1" />
        </>
      )}
      {hardware && <div className="vd-phone-island" />}
      {shell === "android" && <div className="vd-phone-punch" />}
      <div className="vd-phone-screen">{children}</div>
    </div>
  );
}
