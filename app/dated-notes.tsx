import type { DatedNote } from "@/lib/dated-window";

/**
 * What a research text's own dates say on the day a page is read
 * (lib/dated-window `datedNotes`): a window its figure was stated for that
 * has ended, an effective date that has come. One line in the caution tone
 * under the text, which stays as written — never folded away, never a next
 * figure written in. Nothing while every window holds. Pure, so the rules
 * panel, the market brief's rule and market notes and the demo draw one.
 */
export function DatedNotes({ notes, className = "" }: { notes: readonly (DatedNote | string)[]; className?: string }) {
  if (notes.length === 0) return null;
  return (
    <p className={`text-xs font-medium leading-snug text-caution ${className}`} data-qa="window-ended">
      {notes.map((n) => (typeof n === "string" ? n : n.text)).join(" ")}
    </p>
  );
}
