// Keep pop-up cards/menus fully visible (user req: 弹层不能被遮挡/截断).
// Attach as a ref callback: on mount, nudge the element back inside the
// viewport and cap its height with internal scrolling.

const MARGIN = 8;

export function clampPop(el: HTMLElement | null): void {
  if (!el) return;
  // wait a frame so layout (fonts, submenu content) settles
  requestAnimationFrame(() => {
    if (!el.isConnected) return;
    el.style.transform = "";
    el.style.maxHeight = "";
    const r = el.getBoundingClientRect();
    let dx = 0;
    let dy = 0;
    if (r.right > window.innerWidth - MARGIN) dx = window.innerWidth - MARGIN - r.right;
    if (r.left + dx < MARGIN) dx = MARGIN - r.left;
    if (r.bottom > window.innerHeight - MARGIN) dy = window.innerHeight - MARGIN - r.bottom;
    if (r.top + dy < MARGIN) dy = MARGIN - r.top;
    if (dx || dy) el.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px)`;
    // if still taller than the viewport, cap and scroll internally
    const r2 = el.getBoundingClientRect();
    if (r2.height > window.innerHeight - MARGIN * 2) {
      el.style.maxHeight = `${window.innerHeight - r2.top - MARGIN}px`;
      el.style.overflowY = "auto";
    }
  });
}
