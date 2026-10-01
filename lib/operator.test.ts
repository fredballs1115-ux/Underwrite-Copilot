// The operator allowlist (lib/operator): the data-health page's internal
// view — the cost of a screen, the feeds, the probes, the steward's
// heartbeat and its setup lines — shows only to the addresses the server's
// OPERATOR_EMAILS names. Every customer sees the corrections ledger alone.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isOperator, operatorEmails } from "./operator";

const CONFIRMED = "2026-09-01T00:00:00Z";
const user = (email: string | null, confirmed: string | null = CONFIRMED) => ({
  email,
  email_confirmed_at: confirmed,
});

describe("operatorEmails", () => {
  it("reads a comma-separated list, trimmed and lower-cased", () => {
    expect([...operatorEmails(" Ops@Firm.com, second@firm.com ,")]).toEqual(["ops@firm.com", "second@firm.com"]);
  });

  it("takes a semicolon or a line break as a separator too", () => {
    expect([...operatorEmails("a@x.com;b@x.com\nc@x.com")]).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
  });

  it("unset, empty or only separators names nobody", () => {
    for (const raw of [undefined, null, "", "  ", ", ,;"]) expect(operatorEmails(raw).size).toBe(0);
  });
});

describe("isOperator", () => {
  it("is an address on the list, compared without regard to case", () => {
    expect(isOperator(user("OPS@firm.com"), "ops@FIRM.com")).toBe(true);
    expect(isOperator(user("ops@firm.com"), "someone@firm.com, ops@firm.com")).toBe(true);
  });

  it("unset OPERATOR_EMAILS means no operator: nothing internal shows to anyone", () => {
    expect(isOperator(user("ops@firm.com"), undefined)).toBe(false);
    expect(isOperator(user("ops@firm.com"), "")).toBe(false);
  });

  it("an address off the list, or a part of one, is a customer", () => {
    expect(isOperator(user("customer@firm.com"), "ops@firm.com")).toBe(false);
    expect(isOperator(user("ops@firm.com.evil"), "ops@firm.com")).toBe(false);
    expect(isOperator(user("x-ops@firm.com"), "ops@firm.com")).toBe(false);
  });

  it("has no wildcard: '*' or a bare domain grants nobody", () => {
    expect(isOperator(user("ops@firm.com"), "*")).toBe(false);
    expect(isOperator(user("ops@firm.com"), "@firm.com")).toBe(false);
    expect(isOperator(user("ops@firm.com"), "firm.com")).toBe(false);
  });

  it("counts only an account whose address is confirmed", () => {
    expect(isOperator(user("ops@firm.com", null), "ops@firm.com")).toBe(false);
    expect(isOperator({ email: "ops@firm.com" }, "ops@firm.com")).toBe(false);
  });

  it("no user, or a user with no address, is no operator", () => {
    expect(isOperator(null, "ops@firm.com")).toBe(false);
    expect(isOperator(undefined, "ops@firm.com")).toBe(false);
    expect(isOperator(user(null), "ops@firm.com")).toBe(false);
    expect(isOperator(user(""), "ops@firm.com")).toBe(false);
  });
});

describe("the data-health page draws its internal view for an operator only", () => {
  const src = readFileSync(join(process.cwd(), "app/(app)/data-health/page.tsx"), "utf8");
  // The JSX after the page's one `operator &&` gate, up to the corrections
  // ledger, which every signed-in reader sees.
  const gated = src.slice(src.indexOf("{operator && ("), src.indexOf("Changelog — corrections in the open"));

  it("asks the server's list, never a client-visible variable", () => {
    expect(src).toContain('from "@/lib/operator-server"');
    expect(src).toMatch(/const operator = isSiteOperator\(user\)/);
    expect(src).not.toMatch(/NEXT_PUBLIC_OPERATOR/);
  });

  it("holds the probes, the feeds, the cost, the heartbeat and the open issues behind the gate", () => {
    expect(gated.length).toBeGreaterThan(0);
    for (const part of ["<CostCard", "<FeedsCard", "PROBES.map", "Steward heartbeat", "Open issues", "steward.mjs", "migration 0028", "cron looks dead"]) {
      expect(gated, part).toContain(part);
      // ...and nowhere outside it.
      expect(src.split(part).length - 1, part).toBe(gated.split(part).length - 1);
    }
  });

  it("reads the cost ledger and the feeds only for an operator", () => {
    expect(src).toMatch(/if \(operator\) \{[^]*?\.from\("analysis_jobs"\)/);
    expect(src).toMatch(/if \(operator\) \{[^]*?feedHealth\(/);
  });
});
