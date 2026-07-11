// Featherweight i18n: Chinese strings are the keys (the app's default
// language), the EN dict maps them to English. t() reads a module-level
// language; components re-render via the store subscription in App.

import { useSyncExternalStore } from "react";

export type Lang = "zh" | "en";

let lang: Lang = (localStorage.getItem("vd_lang") as Lang) || "zh";
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang): void {
  lang = l;
  localStorage.setItem("vd_lang", l);
  listeners.forEach((f) => f());
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => lang,
  );
}

export function t(zh: string): string {
  if (lang === "zh") return zh;
  return EN[zh] ?? zh;
}

const EN: Record<string, string> = {
  // home
  "模型服务": "Model services",
  "更新日志": "Changelog",
  "还没有项目。从上面的输入框开始第一个设计。": "No projects yet. Start your first design from the box above.",
  "添加图片": "Add images",
  "添加图片（截图/参考图）": "Add images (screenshots / references)",
  "开始设计": "Start designing",
  "模板": "Template",
  "编辑": "Edit",
  "删除": "Delete",
  "取消": "Cancel",
  "保存": "Save",
  "名称": "Name",
  "新建 design system": "New design system",
  "模板库即将支持。先用上方的模板卡开始。": "Template library coming soon. Use the cards above for now.",
  "刚刚": "just now",
  "分钟前": "m ago",
  "小时前": "h ago",
  "天前": "d ago",
  "副本": "copy",
  "删除项目": "Delete project",
  "此操作不可撤销。": "This cannot be undone.",
  "以后拓展": "Planned",
  "（即将支持）": "(coming soon)",
  "即将支持": "Coming soon",
  "本地解析": "Parsed locally",
  "名称，如：Acme 品牌": "Name, e.g. Acme brand",
  "粘贴品牌/设计系统上下文——颜色 tokens、字体、间距、语气、组件规范…\n例：\n--primary: #0f62fe; 标题用衬线，正文 Inter；语气克制专业；按钮圆角 8px。":
    "Paste brand / design-system context — color tokens, type, spacing, voice, component rules…",
  "选中的 design system 会注入每次生成，设计将严格使用其中的颜色/字体/组件规范（原版 §8 的最小可用形态；从 codebase 自动提取后续加）。":
    "The selected design system is injected into every generation; designs will strictly follow its colors, type and component rules.",

  // chat
  "像跟设计师对话一样描述，设计会实时出现在右侧画布。": "Describe it like you would to a designer — the design appears live on the canvas.",
  "先配置模型服务 →": "Configure a model service first →",
  "附加内容": "Attach",
  "发送": "Send",
  "停止": "Stop",
  "（见附件）": "(see attachments)",
  "（见附图）": "(see attached images)",
  "已附上下文快照": "Context snapshot attached",
  "（已回答）": "(answered)",
  "→（见右侧画布）": "→ (see the canvas)",
  "（已更新画布）": "(canvas updated)",
  "一个 SaaS 落地页 hero，克制、暖色": "A restrained, warm SaaS landing hero",
  "理财 App dashboard 原型": "A finance app dashboard prototype",
  "5 页产品发布 keynote": "A 5-slide product launch keynote",
  "技能": "Skill",
  "正在生成设计…": "Designing…",
  "（design system 规范已生成）": "(design system spec generated)",

  // editor chrome
  "回到首页": "Back to home",
  "项目操作": "Project actions",
  "隐藏侧边栏": "Hide sidebar",
  "展开侧边栏": "Show sidebar",
  "聊天历史": "Chat history",
  "暂无历史": "No history yet",
  "重新渲染": "Re-render",
  "版本": "Version",
  "调节控件": "Adjust controls",
  "描述想调什么，生成控件": "Describe what to tweak — controls will be generated",
  "全屏演示": "Present fullscreen",
  "打开设置": "Open settings",
  "已存为新版本": "Saved as a new version",
  "模型服务（BYOK）": "Model services (BYOK)",
  "点击画布元素来评论": "Click an element to comment",
  "点击画布元素来编辑": "Click an element to edit",

  // settings
  "支持 Anthropic / OpenAI（含 Responses）/ Gemini 格式，可添加任意兼容服务（自建、代理、第三方）。 API Key 只保存在本地服务端，不会写进浏览器。":
    "Supports Anthropic / OpenAI (incl. Responses) / Gemini formats — add any compatible service. API keys stay on the local server, never in the browser.",
  "使用中": "Active",
  "设为使用中": "Set active",
  "格式": "Format",
  "模型 model": "Model",
  "（保持不变）": "(unchanged)",
  "一句话描述（显示在模型菜单里）": "One-line description (shown in the model menu)",
  "该模型支持思考强度（Effort）控制": "This model supports effort (reasoning) control",
  "请填写模型名称（model）": "Please enter the model name",
  "未配置": "Not configured",
  "未配置模型": "No model configured",
  "＋ 添加模型服务…": "＋ Add model service…",
  "管理模型服务…": "Manage model services…",
  "＋ 添加…": "＋ Add…",
  "添加模型服务": "Add model service",
  "例如：我的 Claude": "e.g. My Claude",

  // share
  "本机（local）": "This machine (local)",
  "局域网链接（即将支持）": "LAN link (coming soon)",
  "生成中…": "Generating…",

  // plus menu / codebase
  "选择要引用的项目": "Pick a project to reference",
  "← 返回": "← Back",
  "返回": "Back",
  "公开仓库 URL": "Public repo URL",
  "拉取中…": "Fetching…",
  "拉取设计文件": "Fetch design files",
  "拉取": "Fetch",
  "此环境不支持选择文件夹": "Folder picking is not supported here",
  "未找到样式/tokens 相关文件": "No style/token files found",
  "个文件": "files",

  // comments
  "让 Claude 处理": "Ask Claude to handle",
  "条未解决评论": "open comments",
  "添加评论": "Add comment",
  "标记已解决": "Mark resolved",
  "退出评论模式": "Exit comment mode",
  "整体": "Whole design",
  "附图": "Attach image",

  // tweaks / edit
  "存为新版本": "Save as new version",
  "把手动改动存为新版本": "Save manual changes as a new version",
  "＋ 添加控件": "＋ Add controls",
  "如：标题字号和 CTA 颜色": "e.g. headline size and CTA color",
  "描述想调什么，如：标题字号和 CTA 颜色": "Describe what to tweak, e.g. headline size and CTA color",
  "生成控件": "Generate controls",
  "这个设计还没有可调控件。描述想调什么，Claude 会生成对应的滑块/色板。":
    "No tweak controls yet. Describe what to adjust and matching sliders/swatches will be generated.",
  "文字": "Text",
  "还原": "Revert",
  "应用到画布": "Apply to canvas",
  "读取图层中…": "Reading layers…",
  "应用": "Apply",
  "预览生成中…": "Rendering preview…",
  "导出中…": "Exporting…",
  "字号": "Size",
  "字重": "Weight",
  "对齐": "Align",
  "排版": "Type",
  "间距": "Spacing",
  "颜色": "Colors",
  "背景": "Background",

  // changelog
  "当前": "Current",
  "新版本": "New version",
  "可用": "available",
  "去下载": "Download",
  "自动更新并重启": "Update & restart",
  "已是最新版本": "Already up to date",
  "暂无发布记录（或无法访问 GitHub）。": "No releases yet (or GitHub unreachable).",
  "开始下载…": "Starting download…",
  "重启安装中…": "Restarting to install…",

  // canvas
  "在左边描述你想要的设计——原型、幻灯片、落地页、one-pager。设计会实时出现在这里。":
    "Describe the design on the left — a prototype, deck, landing page or one-pager. It appears here live.",
};
