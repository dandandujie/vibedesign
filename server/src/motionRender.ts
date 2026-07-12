import { chromium } from "playwright";
import ffmpegStatic from "ffmpeg-static";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// HyperFrames (advanced): render a self-contained HTML motion piece to real
// video. A CSS/WAAPI animation is a seekable timeline — headless Chromium pauses
// every animation, seeks currentTime to t = frame/fps, screenshots each frame,
// and ffmpeg encodes the deterministic frame sequence to MP4/WebM. No model,
// no external service.

const FFMPEG = (ffmpegStatic as unknown as string) || "ffmpeg";

export interface MotionRenderOpts {
  fps?: number;
  durationMs?: number; // override; else derived from the animation loop
  width?: number;
  height?: number;
  format?: "mp4" | "webm";
}

const MAX_FRAMES = 900; // 30s @ 30fps hard cap
const MAX_FRAME_HEIGHT = 4096;
const MAX_FRAME_PIXELS = 16_000_000;

function abortError(signal?: AbortSignal): Error {
  return signal?.reason instanceof Error ? signal.reason : new Error("render aborted");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError(signal);
}

function runFfmpeg(args: string[], signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError(signal));
    const p = spawn(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      fn();
    };
    const onAbort = () => {
      p.kill("SIGKILL");
      finish(() => reject(abortError(signal)));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", (error) => finish(() => reject(error)));
    p.on("close", (code) => finish(() => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err.slice(-400)}`)))));
  });
}

export async function renderMotionVideo(
  html: string,
  opts: MotionRenderOpts = {},
  signal?: AbortSignal,
): Promise<{ buffer: Buffer; mime: string; ext: string }> {
  const fps = Math.min(60, Math.max(5, opts.fps ?? 30));
  const width = Math.min(2560, Math.max(64, Math.round(opts.width ?? 1280)));
  const height = Math.min(2560, Math.max(64, Math.round(opts.height ?? 720)));
  const format = opts.format === "webm" ? "webm" : "mp4";
  if (height > MAX_FRAME_HEIGHT || width * height > MAX_FRAME_PIXELS) throw new Error("motion frame dimensions are too large");

  let dir: string | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const abort = () => void browser?.close().catch(() => {});
  signal?.addEventListener("abort", abort, { once: true });
  try {
    throwIfAborted(signal);
    dir = await mkdtemp(join(tmpdir(), "vd-motion-"));
    throwIfAborted(signal);
    browser = await chromium.launch({ headless: true, timeout: 15_000 });
    throwIfAborted(signal);
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load", timeout: 20_000 });
    // let fonts/layout settle
    await page.waitForTimeout(200);

    // Measure the loop duration and pause every animation so we can seek it.
    const loopMs: number = await page.evaluate(() => {
      const anims = (document as unknown as { getAnimations: () => Animation[] }).getAnimations();
      let dur = 0;
      for (const a of anims) {
        const timing = a.effect && "getTiming" in a.effect ? a.effect.getTiming() : ({} as EffectTiming);
        const d = typeof timing.duration === "number" ? timing.duration : 0;
        if (d > dur) dur = d;
        try {
          a.pause();
        } catch {
          /* ignore */
        }
      }
      return dur;
    });

    const durationMs = Math.min(30_000, Math.max(300, opts.durationMs ?? (loopMs > 0 ? loopMs : 4000)));
    const frames = Math.min(MAX_FRAMES, Math.max(2, Math.round((durationMs / 1000) * fps)));

    for (let f = 0; f < frames; f++) {
      throwIfAborted(signal);
      const t = (f * 1000) / fps;
      await page.evaluate((time) => {
        const anims = (document as unknown as { getAnimations: () => Animation[] }).getAnimations();
        for (const a of anims) {
          try {
            a.currentTime = time;
          } catch {
            /* ignore */
          }
        }
      }, t);
      const shot = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width, height } });
      await writeFile(join(dir, `f${String(f).padStart(5, "0")}.png`), shot);
    }

    const outPath = join(dir, `out.${format}`);
    const common = ["-y", "-framerate", String(fps), "-i", join(dir, "f%05d.png")];
    const enc =
      format === "webm"
        ? ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "32", "-pix_fmt", "yuv420p"]
        : ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart"];
    await runFfmpeg([...common, ...enc, outPath], signal);

    throwIfAborted(signal);
    const buffer = await readFile(outPath);
    return { buffer, mime: format === "webm" ? "video/webm" : "video/mp4", ext: format };
  } finally {
    signal?.removeEventListener("abort", abort);
    await browser?.close().catch(() => {});
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
