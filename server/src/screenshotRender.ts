import { openValidationBrowser, setIsolatedContent, type ValidationBrowserSession } from "./browserRuntime.js";

// Pixel-perfect export via headless Chromium — a real browser render of the
// artifact, so embedded fonts, WebGL, and every CSS feature rasterize correctly
// (client-side modern-screenshot can't do fonts/WebGL). PNG or print-to-PDF.

export interface ShotOpts {
  format?: "png" | "pdf";
  width?: number;
  scale?: number; // deviceScaleFactor for PNG (retina)
  fullPage?: boolean; // PNG: capture the whole scroll height
  selector?: string; // PNG: capture one element
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

  let browser: ValidationBrowserSession | undefined;
  const abort = () => void browser?.close().catch(() => {});
  signal?.addEventListener("abort", abort, { once: true });
  try {
    throwIfAborted(signal);
    browser = await openValidationBrowser();
    throwIfAborted(signal);
    const page = await browser.newPage({ width, height: 900 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: format === "png" ? scale : 1,
      mobile: false,
    });
    await setIsolatedContent(page, html);
    // wait for webfonts + a beat for layout/WebGL to settle
    await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready).catch(() => {});
    await page.waitForTimeout(300);

    if (format === "pdf") {
      // one page sized to the content, so a design exports as a single crisp page
      const h = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
      const buffer = await browser.printToPDF(page, width, Math.max(200, Math.min(30000, h)));
      return { buffer, mime: "application/pdf", ext: "pdf" };
    }

    const target = opts.selector ? page.locator(opts.selector).first() : null;
    const box = target ? await target.boundingBox() : null;
    if (target && !box) throw new Error("screenshot target not found");
    const contentHeight = box?.height ?? (opts.fullPage ?? true
      ? await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight))
      : 900);
    const contentWidth = box?.width ?? width;
    const outputHeight = contentHeight * scale;
    if (outputHeight > MAX_PNG_HEIGHT) throw new Error(`PNG height exceeds ${MAX_PNG_HEIGHT}px`);
    if (contentWidth * scale * outputHeight > MAX_PNG_PIXELS) {
      throw new Error(`PNG exceeds ${MAX_PNG_PIXELS} pixels`);
    }
    throwIfAborted(signal);
    const buffer = target
      ? await target.screenshot({ type: "png" })
      : await page.screenshot({ type: "png", fullPage: opts.fullPage ?? true });
    return { buffer, mime: "image/png", ext: "png" };
  } finally {
    signal?.removeEventListener("abort", abort);
    await browser?.close().catch(() => {});
  }
}
