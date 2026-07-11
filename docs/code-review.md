# 代码审查 · 本轮升级（open-design 参考）

> 范围：本轮全部改动（54 文件、~1800 行新增；6 个新后端模块、7 个新前端组件/lib、8 篇 craft、全部 skill frontmatter、Live/HyperFrames/换肤/导出/标注/markdown 文档等）。
> 方法：6 路并行 finder（逐行正确性 A / 移除行为 B / 跨文件追踪 C / cleanup / altitude / conventions）→ 去重 → 逐条核验 → ≤10 条最严重。
> 结论：**发现 10 条，全部已修并验证**。多为我实现中的真实 bug（尤其 mddoc 提取截断——此前测试直接渲染、绕过了提取路径，故未测到）。

## 已修复（10 条，按严重度）

| # | 位置 | 问题 | 修复 | 验证 |
|---|---|---|---|---|
| 1 | `web/src/lib/artifact.ts` `MDDOC_FENCE` | mddoc 非贪婪匹配，含 ```代码块```的文档在第一个内层 ``` 处被截断，代码块及其后全丢 | 改贪婪匹配到最后一个 ```（mddoc 是末尾交付物）；stripArtifact 同步改为到末尾 | tsx：含 ```js 的文档整体提取（前/后/代码块都在） |
| 2 | `web/src/lib/inspector.ts` `applyPalette` 第二段 | 换肤读回自己写的 `#vd-palette` 覆盖层（作者选择器无 data-vd 标记不被跳过），硬编码色被累计过冲 | 第二段遍历样式表时跳过 `ownerNode.id==="vd-palette"` 的自身覆盖层 | 真窗口：连续两次 +30° 现幂等（before≠after1===after2），reset 还原 |
| 3 | `web/src/pages/EditorPage.tsx` `sendVisualAnnotation` | 标注合成按 documentElement 尺寸缩放但截的是 body，居中/窄 body 时标注错位错缩 | 标注改截 `exportPng("html")`（视口），使视口坐标直接对齐 | 逻辑修正（截图与坐标系一致） |
| 4 | `web/src/lib/artifact.ts` `withoutQuotedFences` | 屏蔽 4-backtick 引用区会误删含两处四反引号的合法 artifact 内容（A6-1 收益边缘却引入删除风险） | 移除 `withoutQuotedFences`（回退低价值的 A6-1），extractArtifact 回到原始扫描 | tsx：源码已无该函数 |
| 5 | `server/src/liveArtifacts.ts` `runHttpJson` | 上游缺 mapping `from` 字段→静默写空并丢键，刷新后指标消失无提示 | 只在解析到值（`v!==undefined`）时才写回，缺失保留旧值 | 逻辑修正 |
| 6 | `web/src/pages/EditorPage.tsx` onDone 去重分支 | 相同静态重生成命中去重分支未清 `liveArtifactId`，被取代的 Live 设计会重现 | 去重分支补 `liveArtifactId: null` | 逻辑修正 |
| 7 | `web/src/lib/mddoc.ts` `esc()` | 不转义引号，markdown 链接 URL 含 `"` 破坏 href 属性（属性注入） | esc 增加 `"→&quot;`、`'→&#39;` | 真窗口/tsx：href 值含 &quot;、无裸引号 |
| 8 | `web/src/styles.css` + `PalettePopover.tsx` | 多处可读文本 <14.5px 违反 UI 字号规范（禁 11-13px 小字） | `.live-tab/.live-err/.live-log-row/.dir-mood`→14.5px、`.live-title`→15px、换肤标题/预设→14.5px（徽标/角度值标签豁免） | 视觉一致 |
| 9 | `web/src/pages/EditorPage.tsx` 持久 pin 渲染 | 对每个 pin 重复 `querySelector`+2× `getBoundingClientRect`（N 条评论 = N 次强制 reflow） | frame/stage rect 提到 map 外算一次（IIFE） | 逻辑修正 |
| 10 | `server/src/liveArtifacts.ts` `validateTemplateSecurity` | `\son[a-z]+=` 事件处理器检查被斜杠分隔属性（`<img/onerror=>`）绕过（今日被 CSP+sandbox 兜住不可利用） | 正则改 `[\s/]on[a-z]+=`（空白或斜杠前缀） | 逻辑修正 |

## 附带清理
- 服务端 `storage.ts` 补齐 `ArtifactVersion.kind`、`Project.liveArtifactId`（前后端类型对齐；此前靠 JSON 直通存储侥幸无害）。
- 删除死代码 `labelFrom`（extractDeliverable 已内联同逻辑）。

## 已知/接受的小项（未改，低优先）
- **i18n**：新 handoff bundle 描述串在 zh 模式回退英文；旧 key `"design.html + README…"` 成孤儿。纯回退，无行为损失。
- **html FENCE 对字面 ``` 的非贪婪截断**：既有行为、本 diff 未引入；HTML artifact 极少含字面三反引号（用 `<pre><code>`），保留非贪婪以正确处理「引用示例+真交付物」两块场景。
- **altitude（架构债，非 bug）**：6 种 fence 语言各写一套 extract/strip/openIdx（建议后续抽一张 fence 注册表）；Canvas 四套几乎相同的 postMessage round-trip（建议抽 `request<T>()`）；绘图几何三处重复；liveArtifacts 复制了 storage 的 JSON-CRUD（建议抽 `jsonCollection<T>`）。均记录待后续统一，不阻塞本次提交。

## 全量校验
- `tsc`（web + server）+ `vite build` + `server bundle` 全过。
- 关键修复真窗口/纯函数复验通过（见上表）。
- `.data` 无残留测试数据。
</content>
