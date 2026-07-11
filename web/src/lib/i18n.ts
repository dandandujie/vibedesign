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

// Bidirectional: keys may be Chinese (translated by EN) or English
// (translated by ZH). zh mode → fully Chinese UI; en mode → fully English.
export function t(s: string): string {
  if (lang === "zh") return ZH[s] ?? s;
  return EN[s] ?? s;
}

// English-keyed strings → Chinese (for UI text authored in English).
const ZH: Record<string, string> = {
  // home
  "What will you design today?": "今天想设计点什么？",
  "Draft a landing page, a prototype, a deck…": "描述一个落地页、原型、幻灯片…",
  "Design system": "设计系统",
  "Template": "模板",
  "None": "无",
  "Model": "模型",
  "Start with a template…": "从模板开始…",
  "…or start a blank project →": "…或从空白项目开始 →",
  "Projects": "项目",
  "Design systems": "设计系统",
  "Templates": "模板",
  "Search": "搜索",
  "Prototype": "原型",
  "Slides": "幻灯片",
  "Document": "文档",
  "Wireframe": "线框图",
  "Animation": "动画",
  "Open in new tab": "在新标签页打开",
  "Copy link": "复制链接",
  "Add to favorites": "添加收藏",
  "Remove from favorites": "取消收藏",
  "Duplicate": "创建副本",
  "Rename": "重命名",
  "Delete Project": "删除项目",
  "Delete project": "删除项目",
  "Add a design system": "添加设计系统",
  "Design systems teach Claude your brand. How would you like to start?": "设计系统让 Claude 掌握你的品牌。从哪种方式开始？",
  "Create here": "在这里创建",
  "Connect to GitHub, upload assets, or describe your brand.": "连接 GitHub、上传素材，或直接描述你的品牌。",
  "Create using Claude Code": "用 Claude Code 创建",
  "Best fidelity if you have React components.（即将支持）": "如果你有 React 组件，保真度最佳。（即将支持）",
  "Design systems teach Claude your brand.": "设计系统让 Claude 掌握你的品牌。",
  "Beta": "Beta",

  // chat
  "Describe what you want to create...": "描述你想创造什么…",
  "Describe what you want to create": "描述你想创造什么",
  "Claude has some questions": "Claude 有几个问题",
  "Edited": "已修改",
  "Thinking": "思考",
  "Designing": "设计中",

  // canvas head / tools
  "Annotate": "标注",
  "Tweaks": "微调",
  "Edit": "编辑",
  "Present": "演示",
  "Share": "分享",
  "No file open": "未打开文件",
  "In this tab": "在当前标签页",
  "Fullscreen": "全屏",
  "New tab": "新标签页",
  "Click to comment": "点击元素进行评论",
  "The canvas is empty": "画布还是空的",

  // share
  "Who can access": "谁可以访问",
  "Only you can see this design.": "只有你可以看到这个设计。",
  "Copied": "已复制",
  "Export": "导出",
  "Original size": "原始尺寸",
  "Standalone HTML": "独立 HTML",
  "One self-contained file": "单个自包含文件",
  "Claude Code bundle": "Claude Code 交接包",
  "design.html + README for a coding agent": "design.html + 给编码智能体的 README",
  "PowerPoint": "PowerPoint",
  "Design as full-slide image": "设计整页嵌入幻灯片",
  "PNG image": "PNG 图片",
  "Full design at 2×": "完整设计 2× 导出",
  "More apps": "更多应用",
  "Download": "下载",

  // plus menu
  "Files": "文件",
  "Attach file": "附加文件",
  "Reference another project": "引用其他项目",
  "Code": "代码",
  "Connect GitHub": "连接 GitHub",
  "Link local code…": "关联本地代码…",
  "Designs": "设计",
  "Upload .fig / .pen file": "上传 .fig / .pen 文件",
  "Skills": "技能",
  "Manage connectors": "管理连接器",
  "Base designs off what's currently in code?": "让设计基于现有代码？",
  "Local codebase": "本地代码库",
  "Codebase from GitHub": "GitHub 代码库",
  "Attach": "附加",

  // skills modal
  "Attach a skill to give Claude additional context.": "附加一个技能，为 Claude 提供额外上下文。",
  "Create": "创建",
  "Enhance": "增强",
  "Review": "审查",
  "Export & handoff": "导出与交接",
  "Make a deck": "制作幻灯片",
  "Slide presentation in HTML": "HTML 幻灯片演示",
  "Make a doc": "制作文档",
  "Page-style document, printable out of the box": "页式文档，开箱即可打印",
  "Interactive prototype": "交互原型",
  "Working app with real interactions": "带真实交互的可用应用",
  "Explore many ideas with wireframes and storyboards": "用线框图和分镜探索多个方向",
  "Animated video": "动画视频",
  "Timeline-based motion design": "基于时间线的动效设计",
  "Create design system": "创建设计系统",
  "Skill to use if user asks you to create a design system or UI kit": "为品牌生成设计系统或 UI kit",
  "Frontend design": "前端美学定调",
  "Aesthetic direction for designs outside an existing brand system": "无既有品牌时的美学方向",
  "Variations": "多方案",
  "3+ distinct directions in one file": "一个文件内 3+ 个不同方向",
  "Make tweakable": "添加微调控件",
  "Add in-design tweak controls": "在设计内加入可调控件",
  "Claude API in prototypes": "原型内调用模型",
  "Call the model from artifacts via window.claude.complete": "通过 window.claude.complete 在原型里调用模型",
  "Polish pass": "整体打磨",
  "Accessibility, slop, hierarchy & states in one pass": "无障碍、AI 味、层级与状态一次检查",
  "Accessibility audit": "无障碍审查",
  "Contrast, semantics, keyboard, motion": "对比度、语义、键盘、动效",
  "AI-slop check": "AI 味检测",
  "Detect and fix generic AI-template tropes": "识别并修复模板化 AI 套路",
  "Hierarchy & rhythm": "层级与节奏",
  "Size/weight/color signals and spacing discipline": "大小/字重/颜色信号与间距纪律",
  "Interaction states": "交互状态",
  "Hover, focus, active, disabled + transitions": "悬停、聚焦、按下、禁用与过渡",
  "Save as PDF": "存为 PDF",
  "Print-ready PDF export": "可直接打印的 PDF 导出",

  // comments
  "Comments": "评论",
  "No comments yet. Leave feedback below, or click an element in the canvas to pin one.": "还没有评论。在下方留言，或点击画布元素钉一条评论。",
  "Add a comment...": "添加评论…",
  "Describe the issue or suggestion...": "描述问题或建议…",
  "Add comment": "添加评论",
  "Send to Claude": "交给 Claude 处理",

  // edit panel
  "Discard": "放弃",
  "Save": "保存",
  "Simple": "简单",
  "Pro": "专业",
  "Appearance": "外观",
  "Background": "背景",
  "Radius": "圆角",
  "Overflow": "溢出",
  "Opacity": "不透明度",
  "Z-index": "层级",
  "Add:": "添加：",
  "shadow": "阴影",
  "text shadow": "文字阴影",
  "transform": "变换",
  "filter": "滤镜",
  "Border": "边框",
  "Add border": "添加边框",
  "Edit border": "编辑边框",
  "Sizing": "尺寸",
  "Width": "宽",
  "Height": "高",
  "Hug": "自适应",
  "Fixed": "固定",
  "Fill": "填满",
  "Align self": "自身对齐",
  "Position": "定位",
  "Inline": "文档流",
  "Absolute": "绝对定位",
  "Contents layout": "内容布局",
  "Display": "显示",
  "Padding": "内边距",
  "Margin": "外边距",
  "All": "全部",
  "X & Y": "横 & 纵",
  "Individual": "分别设置",
  "Advanced": "高级",
  "Export selection": "导出选中",
  "Format": "格式",
  "Scale": "倍率",
  "Export PNG": "导出 PNG",
  "Debug": "调试",
  "Click any element on the canvas to edit it.": "点击画布上的任意元素进行编辑。",
  "One declaration per line; @name edits an attribute.": "每行一条声明；@名称 可修改属性。",
  "Type": "文字",
  "Size": "字号",
  "Weight": "字重",
  "Color": "颜色",
  "Align": "对齐",
  "Text": "文本",
  "Frame": "框架",
  "Rectangle": "矩形",
  "Oval": "椭圆",
  "Arrow": "箭头",
  "Line": "直线",
  "Draw": "手绘",
  "Select": "选择",
  "Click through (interact with the page)": "点击穿透（与页面交互）",
  "Undo": "撤销",
  "Redo": "重做",

  // model picker
  "Effort": "思考强度",
  "More models": "更多模型",
  "Low": "低",
  "Medium": "中",
  "High": "高",

  // question form
  "Decide for me": "帮我决定",
  "Other": "其他",
  "Other...": "其他…",
  "Your answer...": "你的回答…",
  "Continue": "继续",

  // ds setup
  "← Back": "← 返回",
  "Back": "返回",
  "Continue to generation →": "继续生成 →",
  "Set up your design system": "配置你的设计系统",
  "Tell us about your company and attach any design resources you have.": "介绍你的公司，并附上现有的设计资源。",
  "Company name and blurb": "公司名称与简介",
  "(or name of design system)": "（或设计系统名称）",
  "Provide examples of your design system and products": "提供设计系统与产品的示例",
  "(all optional)": "（全部可选）",
  "What works best: code and designs for your design system and your code products.": "效果最好的：设计系统与产品的代码和设计文件。",
  "Link code from GitHub": "从 GitHub 关联代码",
  "Link code from your computer": "从本机关联代码",
  "Upload a .fig / .pen file": "上传 .fig / .pen 文件",
  "Parsed locally in your browser — never uploaded.": "在浏览器本地解析——不会上传。",
  "Add fonts, logos and assets": "添加字体、Logo 与素材",
  "Any other notes?": "还有其他说明吗？",
  "It will take a few minutes to generate your design system.": "生成设计系统大约需要几分钟。",
  "You can step away. Keep the tab open in the background.": "你可以先去忙别的，保持标签页后台打开即可。",
  "Generate": "生成",
  "Add": "添加",
  "This doesn't upload the whole codebase; design-relevant files are copied locally. For large codebases, attach a frontend-focused subfolder.":
    "不会上传整个代码库；只在本地拷贝与设计相关的文件。大型代码库建议附加聚焦前端的子目录。",

  // misc
  "Version": "版本",
  "Changelog": "更新日志",
  "Model services": "模型服务",
};

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
