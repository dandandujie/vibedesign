// Re-export shim: the implementation moved to the repo-root shared/ module so
// server and web share one copy. See shared/mddoc.ts.
export { markdownToBody, markdownToHtml } from "../../../shared/mddoc";
