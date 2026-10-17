/**
 * The same memorandum, byte for byte, already on an earlier deal
 * (lib/same-memorandum): said on the newer deal with a link, by the
 * fingerprint every screen stores with its extraction — never a reason to
 * refuse an upload (research pass 30).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sameMemorandum, sameMemorandumTail } from "./same-memorandum";
import { gluedWords } from "./render-lint";

describe("sameMemorandum — the earliest deal holding the same file", () => {
  it("names the earliest, the day it was added, and how many more hold it", () => {
    const same = sameMemorandum([
      { id: "d2", name: "Oakwood Flats (2)", created_at: "2026-09-20T10:00:00Z" },
      { id: "d1", name: "Oakwood Flats", created_at: "2026-09-12T10:00:00Z" },
    ]);
    expect(same).toEqual({ id: "d1", name: "Oakwood Flats", added: "Sep 12, 2026", more: 1 });
    const line = `This same memorandum, byte for byte, is already on ${same!.name}${sameMemorandumTail(same!)}`;
    expect(line).toBe(
      "This same memorandum, byte for byte, is already on Oakwood Flats, added Sep 12, 2026, and on 1 more deal in your pipeline — open it to see that screen; this one reads the same file again.",
    );
    expect(gluedWords(line)).toEqual([]);
  });

  it("one earlier deal is said alone; none says nothing", () => {
    const one = sameMemorandum([{ id: "d1", name: "  ", created_at: "not a date" }])!;
    expect(one).toEqual({ id: "d1", name: "an untitled deal", added: null, more: 0 });
    expect(sameMemorandumTail(one)).toBe(" — open it to see that screen; this one reads the same file again.");
    expect(sameMemorandum([])).toBeNull();
    expect(sameMemorandum(null)).toBeNull();
  });

  it("the deal page asks for earlier deals with the same fingerprint, and no upload is refused on it", () => {
    const page = readFileSync(join(process.cwd(), "app/(app)/deals/[id]/page.tsx"), "utf8");
    expect(page).toContain('.eq("extraction->>omFingerprint", fingerprint)');
    expect(page).toContain('.neq("id", id)');
    expect(page).toContain('q.lt("created_at", deal.created_at)');
    expect(page).toContain('data-qa="same-memorandum"');
    const actions = readFileSync(join(process.cwd(), "app/(app)/deals/actions.ts"), "utf8");
    expect(actions).not.toMatch(/omFingerprint\)[\s\S]{0,200}error: "/);
    expect(actions).not.toMatch(/"duplicate"/);
  });
});
