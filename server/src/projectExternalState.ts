import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { writeJsonAtomic } from "./jsonFile.js";

type FileState = { schemaVersion: 1; files: Record<string, string> };

function projectFiles(root: string, directory = root): string[] {
  const output: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (directory === root && entry.name === ".vibedesign") continue;
    const absolute = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error("project state does not follow symbolic links");
    }
    if (entry.isDirectory()) output.push(...projectFiles(root, absolute));
    else if (entry.isFile()) output.push(relative(root, absolute).replace(/\\/g, "/"));
  }
  return output;
}

function fingerprint(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const path of projectFiles(root)) {
    result[path] = createHash("sha256").update(readFileSync(join(root, ...path.split("/")))).digest("hex");
  }
  return result;
}

function stateFile(root: string): string {
  return join(root, ".vibedesign", "external-state.json");
}

export function createExternalFileState(root: string): FileState {
  return { schemaVersion: 1, files: fingerprint(root) };
}

export function refreshExternalBaseline(root: string): void {
  writeJsonAtomic(stateFile(root), createExternalFileState(root));
}
