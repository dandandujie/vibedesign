import { Fragment, ReactNode } from "react";

// Minimal markdown for chat prose: **bold**, `code`, and "- " bullets.
// Deliberately tiny — assistant summaries only need these three.
export function renderMarkdown(text: string): ReactNode {
  return text.split("\n").map((line, li) => {
    const bullet = /^\s*[-•]\s+/.test(line);
    const content = renderInline(bullet ? line.replace(/^\s*[-•]\s+/, "") : line);
    return (
      <Fragment key={li}>
        {li > 0 && "\n"}
        {bullet ? <>• {content}</> : content}
      </Fragment>
    );
  });
}

function renderInline(line: string): ReactNode[] {
  // split on **bold** and `code`, keeping delimiters
  const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`")) return <code key={i}>{p.slice(1, -1)}</code>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}
