// A read beside the pipeline's deals that fails is said over the list, never
// shown as no screen running, no deadline (research pass 42, H7). And the
// pipeline page and the meeting workbook read each list of ids a hundred a
// request, reading each request's error.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { pipelineReadNote } from "./pipeline-read-note";

describe("pipelineReadNote", () => {
  it("is nothing where every read answered", () => {
    expect(pipelineReadNote({})).toBeNull();
    expect(pipelineReadNote({ jobs: false, offersDue: false, names: false })).toBeNull();
  });

  it("says what the list leaves out, read by read", () => {
    expect(pipelineReadNote({ jobs: true })).toBe(
      "Part of the pipeline couldn’t be read just now: no card says whether its screen is running, stalled or failed. Refresh in a moment.",
    );
    expect(pipelineReadNote({ jobs: true, offersDue: true, names: true })).toBe(
      "Part of the pipeline couldn’t be read just now: no card says whether its screen is running, stalled or failed, no offers-due date is shown and a teammate’s deal says “Teammate” rather than who added it. Refresh in a moment.",
    );
  });
});

describe("the reads beside the deals", () => {
  it("the pipeline page reads each list of ids through readByIds and says a failure over the list", () => {
    const page = readFileSync("app/(app)/deals/page.tsx", "utf8");
    expect(page).not.toMatch(/\.in\("deal_id", ids\)/);
    expect(page).not.toMatch(/\.in\("id", ids\)/);
    expect(page).not.toMatch(/\.in\("id", teammateIds\)/);
    expect(page).toContain('.in("deal_id", chunk)');
    expect(page).toContain("pipelineReadNote({ jobs: !jobsData, offersDue: !dueRows, names: !mates })");
    expect(page).toContain("readNote={readNote}");
  });

  it("the meeting workbook route builds no workbook on a failed read", () => {
    const route = readFileSync("app/api/pipeline/export/route.ts", "utf8");
    expect(route).not.toMatch(/rows\.map\(\(d\) => d\.id\),\s*\)/);
    expect(route).toContain("if (!dueRows || !mates || !jobRows)");
  });
});
