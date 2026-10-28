import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DECIDER_NAMES } from "@/lib/stress-deciders";
import { STRESS_METHODS, STRESS_RULES_V } from "@/lib/stress-test-types";
import { THRESHOLDS } from "@/lib/how-we-test";

// The rules a verdict is struck by — each row's order of deciders, the role
// of each piece it is set against and each row's thresholds — fingerprinted
// beside the version the snapshot is stamped with (lib/stress-snapshot
// `rules`). A change to any of them fails here until STRESS_RULES_V is
// bumped and this pin moved with it: a call struck under the old rules is
// then compared to nothing (lib/stress-drift `methodChanged`), never read as
// the evidence moving.
const fingerprint = () =>
  createHash("sha256")
    .update(JSON.stringify({ deciders: DECIDER_NAMES, roles: STRESS_METHODS.map((m) => [m.key, m.decides]), thresholds: THRESHOLDS }))
    .digest("hex")
    .slice(0, 16);

describe("the stress test's rules version", () => {
  it("is bumped whenever the deciders, their roles or the thresholds change", () => {
    expect({ v: STRESS_RULES_V, rules: fingerprint() }).toEqual({ v: 1, rules: "70d37acd505b286a" });
  });
});
