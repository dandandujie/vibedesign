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

export async function renderScreenshot(
  html: string,
  opts: ShotOpts = {},
): Promise<{ buffer: Buffer; mime: string; ext: string }> {
  const format = opts.format === "pdf" ? "pdf" : "png";
  const width = Math.min(2560, Math.max(200, Math.round(opts.width ?? 1280)));
  const scale = Math.min(3, Math.max(1, opts.scale ?? 2));

  const browser = await chromium.launch({ headless: true });
  try {
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

    const buffer = await page.screenshot({ type: "png", fullPage: opts.fullPage ?? true });
    return { buffer, mime: "image/png", ext: "png" };
  } finally {
    await browser.close().catch(() => {});
  }
}
