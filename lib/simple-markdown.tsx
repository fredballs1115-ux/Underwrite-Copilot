import type { ReactNode } from "react";

// Minimal markdown → React for TRUSTED pipeline output (journal entries,
// digests — written by our own cron via the service role; RLS blocks any
// other writer). Handles the subset those prompts are told to emit: ##/###
// headings, paragraphs, "- " lists, [text](url) links, **bold**, *italic*.
// Everything renders as React nodes, so escaping is automatic — no
// dangerouslySetInnerHTML, and links must be http(s).

const INLINE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*\n]+)\*/g;

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let k = 0;
  INLINE.lastIndex = 0;
  for (let m = INLINE.exec(text); m; m = INLINE.exec(text)) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] && m[2]) {
      nodes.push(
        <a
          key={`${keyBase}-${k++}`}
          href={m[2]}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-dotted underline-offset-2 hover:text-brand"
        >
          {m[1]}
        </a>
      );
    } else if (m[3]) {
      nodes.push(<strong key={`${keyBase}-${k++}`}>{m[3]}</strong>);
    } else if (m[4]) {
      nodes.push(<em key={`${keyBase}-${k++}`}>{m[4]}</em>);
    }
    last = INLINE.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function SimpleMarkdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let key = 0;

  const flushPara = () => {
    if (para.length) {
      const joined = para.join(" ");
      blocks.push(
        <p key={`p${key++}`} className="text-sm leading-relaxed">
          {renderInline(joined, `p${key}`)}
        </p>
      );
      para = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push(
        <ul key={`ul${key++}`} className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
          {list.map((item, i) => (
            <li key={i}>{renderInline(item, `li${key}-${i}`)}</li>
          ))}
        </ul>
      );
      list = [];
    }
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      flushPara();
      flushList();
      continue;
    }
    const heading = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushPara();
      flushList();
      const level = heading[1].length;
      blocks.push(
        level <= 2 ? (
          <h2 key={`h${key++}`} className="pt-1 text-sm font-semibold tracking-tight">
            {renderInline(heading[2], `h${key}`)}
          </h2>
        ) : (
          <h3 key={`h${key++}`} className="text-[13px] font-semibold">
            {renderInline(heading[2], `h${key}`)}
          </h3>
        )
      );
      continue;
    }
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      flushPara();
      list.push(trimmed.slice(2));
      continue;
    }
    flushList();
    para.push(trimmed);
  }
  flushPara();
  flushList();

  return <div className="space-y-2.5">{blocks}</div>;
}
