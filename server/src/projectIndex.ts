import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ProjectIndexDocument, ProjectIndexEntry } from "../../shared/project.js";
import { readJsonFile, writeJsonAtomic } from "./jsonFile.js";

export class ProjectIndexStore {
  constructor(private readonly file: string) {}

  list(): ProjectIndexEntry[] {
    return readJsonFile<ProjectIndexDocument>(this.file, { schemaVersion: 1, projects: [] }).projects;
  }

  upsert(entry: ProjectIndexEntry): void {
    const entries = this.list();
    const index = entries.findIndex((item) => item.id === entry.id);
    if (index >= 0) entries[index] = { ...entries[index], ...entry, missing: undefined, invalid: undefined };
    else entries.push(entry);
    this.write(entries);
  }

  remove(id: string): void {
    this.write(this.list().filter((entry) => entry.id !== id));
  }

  private write(projects: ProjectIndexEntry[]): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeJsonAtomic(this.file, { schemaVersion: 1, projects } satisfies ProjectIndexDocument);
  }
}
