import { createServer, type Server } from "node:http";
import type { Locator, Page } from "playwright";
import type { ProjectFlowCommand, ProjectFlowRuntimeReport, ProjectFlowTarget } from "../../shared/project.js";
import { openValidationBrowser, type ValidationBrowserOptions, type ValidationBrowserSession } from "./browserRuntime.js";
import { ProjectRepository, ProjectRepositoryError } from "./projectRepository.js";

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") reject(new Error("failed to bind project validation server"));
      else resolve(address.port);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function targetLocator(page: Page, target: ProjectFlowTarget): Locator {
  if (target.by === "role") {
    return page.getByRole(target.value, { ...(target.name ? { name: target.name, exact: true } : {}) });
  }
  if (target.by === "label") return page.getByLabel(target.value, { exact: true });
  if (target.by === "text") return page.getByText(target.value, { exact: true });
  return page.locator(`[data-vd-id=${JSON.stringify(target.value)}]`);
}

async function auditPageAccessibility(page: Page): Promise<{
  accessibilityIssues: string[];
  inoperableControls: string[];
}> {
  return page.evaluate(() => {
    const accessibilityIssues: string[] = [];
    const inoperableControls: string[] = [];
    const helpers = {
      visible(element: Element): element is HTMLElement {
        if (!(element instanceof HTMLElement)) return false;
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && element.getClientRects().length > 0;
      },
      describe(element: Element) {
        const id = element.id ? `#${element.id}` : "";
        const text = (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 50);
        return `<${element.tagName.toLowerCase()}${id}>${text ? `“${text}”` : ""}`;
      },
      referencedText(value: string | null) {
        return (value ?? "")
          .split(/\s+/)
          .filter(Boolean)
          .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
          .filter(Boolean)
          .join(" ");
      },
      accessibleName(element: Element) {
        const aria = element.getAttribute("aria-label")?.trim();
        if (aria) return aria;
        const labelled = helpers.referencedText(element.getAttribute("aria-labelledby"));
        if (labelled) return labelled;
        if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
          const labels = [...(element.labels ?? [])].map((label) => label.textContent?.trim() ?? "").filter(Boolean).join(" ");
          if (labels) return labels;
          if (element instanceof HTMLInputElement && ["button", "submit", "reset"].includes(element.type) && element.value.trim()) return element.value.trim();
        }
        const text = element.textContent?.trim();
        if (text) return text;
        return element.getAttribute("title")?.trim() ?? "";
      },
    };

    const controls = [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea")];
    for (const control of controls) {
      if (!helpers.visible(control) || control.getAttribute("aria-hidden") === "true") continue;
      if (!helpers.accessibleName(control)) accessibilityIssues.push(`缺少可访问名称：${helpers.describe(control)}`);
      if ((control as HTMLButtonElement | HTMLInputElement).disabled || control.getAttribute("aria-disabled") === "true") continue;
      const style = getComputedStyle(control);
      if (style.pointerEvents === "none") {
        inoperableControls.push(`无法操作（pointer-events: none）：${helpers.describe(control)}`);
        continue;
      }
      control.scrollIntoView({ block: "center", inline: "center" });
      const rect = control.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) {
        inoperableControls.push(`没有可点击区域：${helpers.describe(control)}`);
        continue;
      }
      const x = Math.min(innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
      const y = Math.min(innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
      const hit = document.elementFromPoint(x, y);
      const relatedLabel = control.closest("label");
      if (hit && hit !== control && !control.contains(hit) && !(relatedLabel && relatedLabel.contains(hit))) {
        inoperableControls.push(`被其他元素遮挡：${helpers.describe(control)}`);
      }
    }
    for (const image of document.querySelectorAll("img")) {
      if (helpers.visible(image) && !image.hasAttribute("alt")) accessibilityIssues.push(`图片缺少 alt：${helpers.describe(image)}`);
    }
    return { accessibilityIssues, inoperableControls };
  });
}

async function runCommand(
  page: Page,
  command: ProjectFlowCommand,
  pagePath: string,
  origin: string,
): Promise<void> {
  if (command.type === "open") {
    await page.goto(`${origin}/${pagePath.split("/").map(encodeURIComponent).join("/")}`, {
      waitUntil: "load",
      timeout: 10_000,
    });
    return;
  }
  if (command.type === "expect-url") {
    await page.waitForURL((url) => decodeURIComponent(url.pathname).replace(/^\/+/, "") === command.value, { timeout: 5_000 });
    return;
  }
  if (command.type === "expect-status") {
    await page.locator('[role="status"], [role="alert"], [aria-live]').filter({ hasText: command.value })
      .waitFor({ state: "visible", timeout: 5_000 });
    return;
  }
  const locator = targetLocator(page, command.target);
  if (command.type === "expect-field-error") {
    await locator.waitFor({ state: "visible", timeout: 5_000 });
    const result = await locator.evaluate((element, expected) => {
      if (element.getAttribute("aria-invalid") !== "true") return "字段没有 aria-invalid=true";
      const ids = (element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
      const descriptions = ids.map((id) => document.getElementById(id)).filter((item): item is HTMLElement => Boolean(item));
      if (!descriptions.length) return "字段没有通过 aria-describedby 关联错误";
      const matching = descriptions.some((item) => {
        const style = getComputedStyle(item);
        return style.display !== "none" && style.visibility !== "hidden" && (item.textContent ?? "").includes(expected);
      });
      return matching ? "" : "关联的错误信息不可见或内容不匹配";
    }, command.value);
    if (result) throw new Error(result);
    return;
  }
  if (command.type === "click") {
    await locator.click({ timeout: 5_000 });
  } else if (command.type === "fill") {
    await locator.fill(command.value, { timeout: 5_000 });
  } else if (command.type === "expect-visible") {
    await locator.waitFor({ state: "visible", timeout: 5_000 });
  } else {
    await locator.filter({ hasText: command.value }).waitFor({ state: "visible", timeout: 5_000 });
  }
}

export async function validateProjectFlowRuntime(
  repository: ProjectRepository,
  projectId: string,
  flowId: string,
  browserOptions?: ValidationBrowserOptions,
): Promise<ProjectFlowRuntimeReport> {
  const record = repository.get(projectId);
  const flow = record.manifest.flows.find((item) => item.id === flowId);
  if (!flow) throw new ProjectRepositoryError("NOT_FOUND", "experience flow not found");
  const runtimeErrors = new Set<string>();
  const brokenLinks = new Set<string>();
  const externalRequests = new Set<string>();
  const horizontalOverflow = new Set<string>();
  const stepFailures = new Set<string>();
  const accessibilityIssues = new Set<string>();
  const inoperableControls = new Set<string>();
  const pagePaths = [...new Set(flow.steps.map((step) => record.manifest.pages.find((page) => page.id === step.pageId)?.path).filter((path): path is string => Boolean(path)))];
  if (!pagePaths.length) runtimeErrors.add("体验流程没有可运行页面");

  const server = createServer((request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname).replace(/^\/+/, "");
      const file = repository.readPreviewFile(projectId, path);
      response.statusCode = 200;
      response.setHeader("Content-Type", file.contentType);
      response.setHeader("Cache-Control", "no-store");
      response.end(file.body);
    } catch {
      response.statusCode = 404;
      response.end("Not found");
    }
  });
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;
  let browserSession: ValidationBrowserSession | undefined;
  try {
    browserSession = await openValidationBrowser(browserOptions);
    for (const path of pagePaths) {
      for (const viewport of record.manifest.viewports) {
        const page = await browserSession.newPage({ width: viewport.width, height: viewport.height });
        const label = `${path} · ${viewport.name}`;
        page.on("pageerror", (error) => runtimeErrors.add(`${label}：${error.message}`));
        page.on("console", (message) => {
          if (message.type() === "error") runtimeErrors.add(`${label}：console ${message.text()}`);
        });
        page.on("response", (networkResponse) => {
          if (networkResponse.url().startsWith(origin) && networkResponse.status() >= 400) {
            brokenLinks.add(`${label}：${networkResponse.status()} ${networkResponse.url()}`);
          }
        });
        await page.route("**/*", async (route) => {
          const url = route.request().url();
          if (url.startsWith(origin) || url.startsWith("data:") || url.startsWith("blob:")) await route.continue();
          else {
            externalRequests.add(`${label}：${url}`);
            await route.abort("blockedbyclient");
          }
        });
        try {
          await page.goto(`${origin}/${path.split("/").map(encodeURIComponent).join("/")}`, { waitUntil: "load", timeout: 10_000 });
          await page.waitForTimeout(100);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
          if (overflow) horizontalOverflow.add(label);
          const audit = await auditPageAccessibility(page);
          audit.accessibilityIssues.forEach((issue) => accessibilityIssues.add(`${label}：${issue}`));
          audit.inoperableControls.forEach((issue) => inoperableControls.add(`${label}：${issue}`));
          const hrefs = await page.locator("a[href]").evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href") ?? ""));
          for (const href of hrefs) {
            if (!href || href === "#" || href.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(href)) continue;
            const target = new URL(href, page.url());
            if (target.origin !== origin) {
              externalRequests.add(`${label}：${target.href}`);
              continue;
            }
            target.hash = "";
            const linkResponse = await page.request.get(target.href, { timeout: 5_000 }).catch(() => undefined);
            if (!linkResponse?.ok()) brokenLinks.add(`${label}：${target.pathname}`);
          }
        } catch (error) {
          runtimeErrors.add(`${label}：${error instanceof Error ? error.message : String(error)}`);
        } finally {
          await browserSession.closePage(page);
        }
      }
    }
    for (const viewport of record.manifest.viewports) {
      const page = await browserSession.newPage({ width: viewport.width, height: viewport.height });
      let activeLabel = `${flow.name} · ${viewport.name}`;
      page.on("pageerror", (error) => runtimeErrors.add(`${activeLabel}：${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error") runtimeErrors.add(`${activeLabel}：console ${message.text()}`);
      });
      await page.route("**/*", async (route) => {
        const url = route.request().url();
        if (url.startsWith(origin) || url.startsWith("data:") || url.startsWith("blob:")) await route.continue();
        else {
          externalRequests.add(`${activeLabel}：${url}`);
          await route.abort("blockedbyclient");
        }
      });
      try {
        for (const [stepIndex, step] of flow.steps.entries()) {
          const projectPage = record.manifest.pages.find((item) => item.id === step.pageId);
          activeLabel = `${flow.name} · ${viewport.name} · 步骤 ${stepIndex + 1}`;
          if (!projectPage) {
            stepFailures.add(`${activeLabel}：引用了未知页面`);
            break;
          }
          if (!step.commands.length) {
            stepFailures.add(`${activeLabel}：缺少可执行命令`);
            break;
          }
          for (const [commandIndex, command] of step.commands.entries()) {
            try {
              await runCommand(page, command, projectPage.path, origin);
            } catch (error) {
              stepFailures.add(`${activeLabel} · 命令 ${commandIndex + 1}（${command.type}）：${error instanceof Error ? error.message : String(error)}`);
              break;
            }
          }
          if ([...stepFailures].some((failure) => failure.startsWith(activeLabel))) break;
        }
      } finally {
        await browserSession.closePage(page);
      }
    }
  } catch (error) {
    runtimeErrors.add(`无法启动浏览器验证：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await browserSession?.close().catch(() => undefined);
    await closeServer(server);
  }

  return {
    runtimeErrors: [...runtimeErrors].sort(),
    brokenLinks: [...brokenLinks].sort(),
    externalRequests: [...externalRequests].sort(),
    horizontalOverflow: [...horizontalOverflow].sort(),
    stepFailures: [...stepFailures].sort(),
    accessibilityIssues: [...accessibilityIssues].sort(),
    inoperableControls: [...inoperableControls].sort(),
  };
}
