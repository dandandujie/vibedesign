# 正式安装版复用 Electron Chromium 运行流程验证

VibeDesign 的开发环境继续使用 Playwright 管理的 Chromium，正式安装版则启动一个不可见、仅绑定本机调试端口的 Electron 子进程，并由 Playwright 顺序复用其中唯一页面执行相同验证。我们不在安装包中再附带一份完整 Chrome，也不依赖用户机器上的 Playwright 缓存或系统浏览器，因为前者会显著放大本地设计工具的体积，后两者无法保证完成门槛在安装后仍然成立。
