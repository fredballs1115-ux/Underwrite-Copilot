import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WORKER_SENDS, emailNotes } from "./email-notes";
import { gluedWords } from "./render-lint";

// The account page's email notes, held to what is sent: the web service's
// own setup had been read as the state of both emails, though the digest
// always goes from the background worker; and the screen email's promise
// covered a stalled run, which sends nothing.
describe("the account page's email notes", () => {
  it("says the digest is the worker's to send, always — and the screen emails too in worker mode", () => {
    for (const sending of [true, false]) {
      expect(emailNotes({ sending, workerMode: false }).digestSentBy).toBe(WORKER_SENDS);
      const worker = emailNotes({ sending, workerMode: true });
      expect(worker.digestSentBy).toBe(WORKER_SENDS);
      expect(worker.analysisSentBy).toBe(WORKER_SENDS);
      // This service sends no customer email in worker mode: its own setup
      // says nothing of whether one goes.
      expect(worker.paused).toBeNull();
    }
    expect(WORKER_SENDS).toMatch(/background worker/);
    expect(WORKER_SENDS).toMatch(/only where the worker has the email settings too/);
  });

  it("pauses only what this service sends, and never says both emails are paused", () => {
    const paused = emailNotes({ sending: false, workerMode: false });
    expect(paused.paused).toMatch(/^Screen emails are paused for now — none is being sent\./);
    expect(paused.analysisSentBy).toBeNull();
    expect(emailNotes({ sending: true, workerMode: false }).paused).toBeNull();
    for (const n of [paused, emailNotes({ sending: true, workerMode: true })]) {
      expect(JSON.stringify(n)).not.toMatch(/Both emails/);
    }
  });

  it("promises what is sent: a stopped screen's email, and none for a stalled one", () => {
    const { analysis, digest } = emailNotes({ sending: true, workerMode: false });
    expect(analysis).toContain("one if a screen stops before its verdict, saying why");
    expect(analysis).toContain("A screen that stalls, cut off part way with no error to report, sends none; the deal page shows it as stalled.");
    expect(analysis).toContain("each screen you start");
    expect(digest).toContain("your open deals by stage");
    for (const s of Object.values(emailNotes({ sending: false, workerMode: true }))) if (s) expect(gluedWords(s)).toEqual([]);
  });

  it("is what the account page draws, in place of the sentences it typed", () => {
    const page = readFileSync(join(process.cwd(), "app/(app)/account/page.tsx"), "utf8");
    expect(page).toContain("emailNotes({ sending: emailEnabled(), workerMode })");
    expect(page).toContain("analysisWorkerEnabled() && (await workerSchemaReady(supabase))");
    for (const gone of ["Both emails are paused", "fails before its verdict", "offers due this week"]) {
      expect(page.replace(/\s+/g, " ")).not.toContain(gone);
    }
  });
});
