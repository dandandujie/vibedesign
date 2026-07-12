import { chromium } from "playwright";

// Pixel-perfect export via headless Chromium — a real browser render of the
// artifact, so CJK webfonts, WebGL, and every CSS feature rasterize correctly
// (client-side modern-screenshot can't do fonts/WebGL). PNG or print-to-PDF.

export interface ShotOpts {
  format?: "png" | "pdf";
  width?: number;
  scale?: number; // deviceScaleFactor for PNG (retina)
  fullPage?: boolean; // PNG: capture the whole scroll height
}

const MAX_PNG_HEIGHT = 12_000;
const MAX_PNG_PIXELS = 40_000_000;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("render aborted");
}

export async function renderScreenshot(
  html: string,
  opts: ShotOpts = {},
  signal?: AbortSignal,
): Promise<{ buffer: Buffer; mime: string; ext: string }> {
  const format = opts.format === "pdf" ? "pdf" : "png";
  const width = Math.min(2560, Math.max(200, Math.round(opts.width ?? 1280)));
  const scale = Math.min(3, Math.max(1, opts.scale ?? 2));

  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const abort = () => void browser?.close().catch(() => {});
  signal?.addEventListener("abort", abort, { once: true });
  try {
    throwIfAborted(signal);
    browser = await chromium.launch({ headless: true, timeout: 15_000 });
    throwIfAborted(signal);
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: format === "png" ? scale : 1 });
    await page.setContent(html, { waitUntil: "load", timeout: 20_000 });
    // wait for webfonts + a beat for layout/WebGL to settle
    await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready).catch(() => {});
    await page.waitForTimeout(300);

    if (format === "pdf") {
      // one page sized to the content, so a design exports as a single crisp page
      const h = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
      const buffer = await page.pdf({
        printBackground: true,
        width: `${width}px`,
        height: `${Math.max(200, Math.min(30000, h))}px`,
        pageRanges: "1",
      });
      return { buffer, mime: "application/pdf", ext: "pdf" };
    }

    const contentHeight = opts.fullPage ?? true
      ? await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight))
      : 900;
    const outputHeight = contentHeight * scale;
    if (outputHeight > MAX_PNG_HEIGHT) throw new Error(`PNG height exceeds ${MAX_PNG_HEIGHT}px`);
    if (width * scale * outputHeight > MAX_PNG_PIXELS) {
      throw new Error(`PNG exceeds ${MAX_PNG_PIXELS} pixels`);
    }
    throwIfAborted(signal);
    const buffer = await page.screenshot({ type: "png", fullPage: opts.fullPage ?? true });
    return { buffer, mime: "image/png", ext: "png" };
  } finally {
    signal?.removeEventListener("abort", abort);
    await browser?.close().catch(() => {});
  }
}
