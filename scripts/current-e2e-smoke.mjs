import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../server/node_modules/playwright/index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverRoot = join(root, "server");
const tsxCli = join(serverRoot, "node_modules", "tsx", "dist", "cli.mjs");
const dataDir = mkdtempSync(join(tmpdir(), "vibedesign-e2e-"));

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("failed to reserve a TCP port"));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForHttp(url, child, logs) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited with ${child.exitCode}\n${logs()}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server did not become ready\n${logs()}`);
}

const port = await reservePort();
const baseUrl = `http://127.0.0.1:${port}`;
let output = "";
const child = spawn(process.execPath, [tsxCli, "src/index.ts"], {
  cwd: serverRoot,
  env: { ...process.env, PORT: String(port), VD_DATA_DIR: dataDir },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

let browser;
try {
  await waitForHttp(`${baseUrl}/api/meta`, child, () => output);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: "networkidle" });

  const title = await page.locator("h1").textContent();
  if (title?.trim() !== "今天想设计点什么？") throw new Error(`unexpected home title: ${title}`);
  await page.locator('textarea[placeholder="描述一个落地页、原型、幻灯片…"]').waitFor();
  await page.getByRole("button", { name: "项目", exact: true }).waitFor();
  await page.getByText("还没有本地设计项目。先确认一份项目提案。").waitFor();
  await page.getByRole("button", { name: "预览安全", exact: true }).click();
  const safetyDialog = page.getByRole("dialog", { name: "预览安全与反馈" });
  await safetyDialog.getByText("尚未执行旧项目迁移，目前没有迁移备份需要处理。").waitFor();
  await safetyDialog.getByText("反馈不会自动上传。").waitFor();
  await safetyDialog.getByRole("button", { name: "关闭预览安全" }).click();

  await page.getByRole("button", { name: "新建设计项目" }).click();
  await page.getByLabel("项目名称", { exact: true }).fill("Project V2 E2E");
  await page.getByLabel("产品目标与用户", { exact: true }).fill("验证多页面项目工作区。");
  await page.getByPlaceholder("D:\\Designs").fill(dataDir);
  await page
    .getByRole("combobox", { name: "初始化模板 模板仅用于初始化，不会永久限制项目。" })
    .selectOption("product");
  await page.getByRole("button", { name: "确认并创建项目" }).click();
  await page.waitForURL(/#\/project\/[\w-]+$/);
  await page.getByRole("heading", { name: "产品原型" }).waitFor();
  await page.getByRole("button", { name: "工作台 1" }).waitFor();
  await page.getByRole("button", { name: "项目详情 2" }).waitFor();
  await page.getByRole("button", { name: "设置 3" }).waitFor();
  const projectId = page.url().match(/#\/project\/([\w-]+)$/)?.[1];
  if (!projectId) throw new Error("missing Project V2 id in workspace URL");
  const recordResponse = await fetch(`${baseUrl}/api/v2/projects/${projectId}`);
  if (!recordResponse.ok) throw new Error(`failed to read Project V2: ${recordResponse.status}`);
  const record = await recordResponse.json();
  const files = record.manifest.pages.map((projectPage) => ({
    path: projectPage.path,
    content: `<!doctype html><html lang="zh-CN"><head><link rel="stylesheet" href="../tokens.css"></head><body><main><h1>${projectPage.title}</h1></main></body></html>`,
  }));
  const planResponse = await fetch(`${baseUrl}/api/v2/projects/${projectId}/changes/plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ files }),
  });
  if (!planResponse.ok) throw new Error(`failed to plan E2E pages: ${planResponse.status}`);
  const impact = await planResponse.json();
  const commitResponse = await fetch(`${baseUrl}/api/v2/projects/${projectId}/changes/commit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ files, confirmedImpactHash: impact.impactHash }),
  });
  if (!commitResponse.ok) throw new Error(`failed to commit E2E pages: ${commitResponse.status}`);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "查看并管理项目 3" }).click();
  await page.getByText("3 个步骤").waitFor();
  await page.frameLocator("iframe").getByRole("heading", { name: "工作台" }).waitFor();
  await page.getByRole("button", { name: "运行并校验流程", exact: true }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("button", { name: "完成运行", exact: true }).click();
  await page.getByRole("button", { name: "开始设计评审", exact: true }).waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: "开始设计评审", exact: true }).click();
  const reviewDialog = page.getByRole("dialog", { name: "查看并管理项目" });
  await reviewDialog.waitFor();
  const criteria = reviewDialog.getByRole("checkbox");
  if (await criteria.count() !== 6) throw new Error("design review must contain six criteria");
  for (let index = 0; index < 6; index += 1) await criteria.nth(index).check();
  await reviewDialog.locator("textarea").fill("E2E 评审记录");
  await reviewDialog.getByRole("button", { name: "接受评审并完成", exact: true }).click();
  await page.getByText("流程已完成并记录设计评审：查看并管理项目").waitFor();

  if (pageErrors.length) throw new Error(`page errors:\n${pageErrors.join("\n")}`);

  console.log("Current app, preview safety, Project V2 workspace, browser validation, and structured design review E2E smoke passed.");
} finally {
  await browser?.close();
  child.kill();
  await new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    child.once("exit", resolve);
    setTimeout(resolve, 2_000);
  });
  rmSync(dataDir, { recursive: true, force: true });
}
