/**
 * The batch upload's run (lib/batch-run, which app/(app)/deals/batch-upload
 * drives through its injectable submit): a plan's deal limit stops the rest
 * of the batch, and the panel then offers no "Retry failed uploads" that can
 * only fail the same way, but one line saying the limit with a link to the
 * plan (research pass 30).
 */
import { describe, expect, it } from "vitest";
import { capNotice, runBatch, runLabel, sendable, statusOf, type BatchResult, type BatchStatus } from "./batch-run";

const ready = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `OM ${i + 1}`, status: { kind: "ready" } as BatchStatus }));

/** A submit that answers from a script, recording what it was sent. */
function scripted(answers: (BatchResult | "throw")[]) {
  const sent: string[] = [];
  let i = 0;
  const send = async (item: { name: string }) => {
    sent.push(item.name);
    const a = answers[i++];
    if (a === "throw") throw new Error("network");
    return a;
  };
  return { send, sent };
}

describe("runBatch — one file at a time, the plan's limit stopping the rest", () => {
  it("a cap mid-batch marks that file and the rest as stopped by the plan, and sends nothing after it", async () => {
    const { send, sent } = scripted([{ ok: true, dealId: "d1" }, { ok: false, error: "limit" }, { ok: true, dealId: "never" }]);
    const seen: [number, string][] = [];
    const out = await runBatch(ready(3), send, (i, s) => seen.push([i, s.kind]));
    expect(sent).toEqual(["OM 1", "OM 2"]);
    expect(out.map((s) => s.kind)).toEqual(["queued", "capped", "capped"]);
    expect(out[1]).toEqual({ kind: "capped", message: "Plan limit reached — this one wasn't uploaded.", plan: "limit" });
    expect(out[2]).toEqual({ kind: "capped", message: "Skipped — plan limit reached.", plan: "limit" });
    expect(seen).toEqual([
      [0, "uploading"],
      [0, "queued"],
      [1, "uploading"],
      [1, "capped"],
      [2, "capped"],
    ]);
    // No button: nothing left to send that would not fail the same way…
    expect(runLabel(out, false, true)).toBeNull();
    // …and the limit, said once, with the way to the plan.
    expect(capNotice(out)).toEqual({
      text: "2 OMs weren't uploaded — you've reached the Free plan's deal limit.",
      link: "Upgrade to Pro for unlimited deals →",
      href: "/billing",
    });
  });

  it("a failure another try may fix is retried; a row the plan stopped never is", async () => {
    const first = scripted([{ ok: false, error: "upload" }, { ok: false, error: "teamlimit" }]);
    const items = ready(2);
    const after = await runBatch(items, first.send);
    expect(after.map((s) => s.kind)).toEqual(["error", "capped"]);
    expect(runLabel(after, false, true)).toBe("Retry failed uploads");
    expect(capNotice(after)?.text).toBe("1 OM wasn't uploaded — your team's trial deals and your personal free deals are all in use.");
    expect(capNotice(after)?.href).toBe("/billing");
    // The retry sends the failed upload alone.
    const second = scripted([{ ok: true, dealId: "d1" }]);
    const again = await runBatch(
      items.map((it, i) => ({ ...it, status: after[i] })),
      second.send,
    );
    expect(second.sent).toEqual(["OM 1"]);
    expect(again.map((s) => s.kind)).toEqual(["queued", "capped"]);
    expect(runLabel(again, false, true)).toBeNull();
  });

  it("no answer at all is a failure that says the deal may exist", async () => {
    const { send } = scripted(["throw"]);
    const [s] = await runBatch(ready(1), send);
    expect(s).toEqual({
      kind: "error",
      message: "No answer came back — it may have been created. Check the pipeline before retrying.",
    });
    expect(sendable(s)).toBe(true);
  });

  it("the button says what it sends, before and during a run", () => {
    const statuses: BatchStatus[] = [{ kind: "ready" }, { kind: "ready" }, { kind: "queued", dealId: "d", deduped: false, personal: false }];
    expect(runLabel(statuses, false, false)).toBe("Screen 2 deals");
    expect(runLabel([{ kind: "ready" }], false, false)).toBe("Screen 1 deal");
    expect(runLabel(statuses, true, false)).toBe("Uploading — keep this tab open…");
    expect(capNotice(statuses)).toBeNull();
    expect(statusOf({ ok: false, error: "nonsense" })).toEqual({ kind: "error", message: "Something went wrong." });
  });
});
