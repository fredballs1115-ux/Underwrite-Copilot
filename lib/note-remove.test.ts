import { describe, expect, it } from "vitest";
import { SAMPLE_AUTHOR, mayRemoveNote } from "@/lib/note-remove";
import { SAMPLE_AUTHOR as SEEDED_BY, sampleWork } from "@/lib/sample-deal";

const me = { userId: "u1", userEmail: "me@example.com" };

describe("mayRemoveNote — the decision log's Remove and the delete action's one rule", () => {
  it("a note is its author's: by id where stamped, else by the email it was written under", () => {
    expect(mayRemoveNote({ by: "me@example.com", byId: "u1" }, me, false)).toBe(true);
    expect(mayRemoveNote({ by: "me@example.com", byId: "u2" }, me, false)).toBe(false);
    expect(mayRemoveNote({ by: "me@example.com" }, me, false)).toBe(true);
    expect(mayRemoveNote({ by: "them@example.com" }, me, false)).toBe(false);
    expect(mayRemoveNote({ by: "me@example.com" }, { userId: "u1", userEmail: null }, false)).toBe(false);
  });

  it("the sample deal's seeded note is its reader's to remove, and only on the sample deal", () => {
    expect(SEEDED_BY).toBe(SAMPLE_AUTHOR);
    const [seeded] = sampleWork("2026-10-16T12:00:00.000Z").notes;
    expect(mayRemoveNote(seeded, me, true)).toBe(true);
    expect(mayRemoveNote(seeded, me, false)).toBe(false);
    // A note with an author id stays its author's, sample or not.
    expect(mayRemoveNote({ by: SAMPLE_AUTHOR, byId: "u2" }, me, true)).toBe(false);
  });
});
