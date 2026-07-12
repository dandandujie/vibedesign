import { existsSync, renameSync, unlinkSync, writeFileSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

function corruptPath(file: string): string {
  const base = `${file}.corrupt`;
  return existsSync(base) ? `${base}-${Date.now()}` : base;
}

export function readJsonFile<T>(file: string, fallback: T): T {
  if (!existsSync(file)) return fallback;
  const raw = readFileSync(file, "utf8");
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    const backup = corruptPath(file);
    renameSync(file, backup);
    throw new Error(`invalid JSON moved to ${backup}`, { cause: err });
  }
}

export function writeJsonAtomic(file: string, value: unknown): void {
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, JSON.stringify(value, null, 2));
    renameSync(temp, file);
  } catch (err) {
    if (existsSync(temp)) unlinkSync(temp);
    throw err;
  }
}
