import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { isAbsolute } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page, type ViewportSize } from "playwright";

export interface ValidationBrowserOptions {
  electronExecutable?: string;
  electronArguments?: string[];
}

export interface ValidationBrowserSession {
  browser: Browser;
  runtime: "playwright" | "electron";
  newPage(viewport: ViewportSize): Promise<Page>;
  closePage(page: Page): Promise<void>;
  close(): Promise<void>;
}

function reserveLocalPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("failed to reserve validation browser port"));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function connectToElectron(child: ChildProcess, endpoint: string): Promise<Browser> {
  const deadline = Date.now() + 15_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Electron validation browser exited with code ${child.exitCode}`);
    try {
      return await chromium.connectOverCDP(endpoint, { timeout: 1_000 });
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }
  throw new Error(`unable to connect to Electron validation browser: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

export async function openValidationBrowser(options: ValidationBrowserOptions = {}): Promise<ValidationBrowserSession> {
  const executable = options.electronExecutable ?? process.env.VD_ELECTRON_VALIDATION_EXECUTABLE;
  if (!executable) {
    const browser = await chromium.launch({ headless: true, timeout: 15_000 });
    return {
      browser,
      runtime: "playwright",
      newPage: (viewport) => browser.newPage({ viewport }),
      closePage: (page) => page.close(),
      close: () => browser.close(),
    };
  }
  if (!isAbsolute(executable) || !existsSync(executable)) {
    throw new Error("configured Electron validation executable does not exist or is not absolute");
  }

  const port = await reserveLocalPort();
  const child = spawn(executable, [
    ...(options.electronArguments ?? []),
    "--vd-validation-browser",
    `--remote-debugging-port=${port}`,
    "--remote-allow-origins=http://127.0.0.1",
    "--headless",
    "--disable-gpu",
  ], { stdio: "ignore", windowsHide: true });
  try {
    const browser = await connectToElectron(child, `http://127.0.0.1:${port}`);
    const page = browser.contexts()[0]?.pages()[0];
    if (!page) throw new Error("Electron validation browser did not expose its hidden page");
    let pageInUse = false;
    return {
      browser,
      runtime: "electron",
      newPage: async (viewport) => {
        if (pageInUse) throw new Error("Electron validation browser only supports sequential page use");
        pageInUse = true;
        await page.setViewportSize(viewport);
        return page;
      },
      closePage: async (activePage) => {
        if (activePage !== page) throw new Error("unknown Electron validation page");
        await page.unrouteAll({ behavior: "wait" }).catch(() => undefined);
        page.removeAllListeners();
        await page.goto("about:blank").catch(() => undefined);
        pageInUse = false;
      },
      close: async () => {
        await browser.close().catch(() => undefined);
        if (child.exitCode === null) child.kill();
      },
    };
  } catch (error) {
    if (child.exitCode === null) child.kill();
    throw error;
  }
}
