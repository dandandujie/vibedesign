import { watch, type FSWatcher } from "node:fs";

type WatchEntry = {
  directory: string;
  watcher: FSWatcher;
  dirty: boolean;
};

export class ProjectWatchRegistry {
  private readonly entries = new Map<string, WatchEntry>();

  watch(projectId: string, directory: string): void {
    const existing = this.entries.get(projectId);
    if (existing?.directory === directory) return;
    existing?.watcher.close();

    const entry: WatchEntry = { directory, watcher: undefined as unknown as FSWatcher, dirty: false };
    entry.watcher = watch(directory, { recursive: true }, (_event, filename) => {
      const path = filename?.toString().replace(/\\/g, "/");
      if (!path || (path !== ".vibedesign" && !path.startsWith(".vibedesign/"))) entry.dirty = true;
    });
    this.entries.set(projectId, entry);
  }

  isDirty(projectId: string): boolean {
    return this.entries.get(projectId)?.dirty ?? false;
  }

  clear(projectId: string): void {
    const entry = this.entries.get(projectId);
    if (entry) entry.dirty = false;
  }
}
