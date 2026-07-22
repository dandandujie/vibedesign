export async function pickLocalCodebase() {
  const browser = window as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> };
  if (!browser.showDirectoryPicker) return { ok: false, error: "此环境不支持选择文件夹" } as const;

  const dir = await browser.showDirectoryPicker();
  const files: { path: string; content: string }[] = [];
  let total = 0;

  async function walk(handle: FileSystemDirectoryHandle, prefix: string, depth: number) {
    if (depth > 3 || files.length >= 12 || total > 120_000) return;
    for await (const [name, entry] of handle as unknown as AsyncIterable<[string, FileSystemHandle]>) {
      if (files.length >= 12 || total > 120_000) return;
      if (name.startsWith(".") || name === "node_modules" || name === "dist") continue;
      if (entry.kind === "directory") {
        await walk(entry as FileSystemDirectoryHandle, `${prefix}${name}/`, depth + 1);
      } else if (/\.(css|scss)$|tokens?\.(json|js|ts)$|tailwind\.config\.|theme\.|package\.json$/i.test(name)) {
        const file = await (entry as FileSystemFileHandle).getFile();
        if (file.size < 60_000) {
          const content = (await file.text()).slice(0, 25_000);
          total += content.length;
          files.push({ path: prefix + name, content });
        }
      }
    }
  }

  await walk(dir, "", 0);
  if (!files.length) return { ok: false, error: "未找到样式/tokens 相关文件" } as const;
  return {
    ok: true,
    name: dir.name,
    files,
    text: files.map((file) => `--- ${file.path} ---\n${file.content}`).join("\n"),
  } as const;
}
