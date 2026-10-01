import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ABBREVIATIONS, firstSentence, foldParts, isCaution, sentencesOf } from "./first-sentence";
import rulesSeed from "@/data/research/regulatory_rules.json";

const RULES = (rulesSeed as { rules: { id: string; effect: string }[] }).rules;
const effectOf = (id: string) => RULES.find((r) => r.id === id)!.effect;

describe("firstSentence — a period ends a sentence only where it is not an abbreviation", () => {
  it("reads the rules that were cut at an abbreviation whole (the research pass of 2026-10-01)", () => {
    // Each printed, in full, as the fragment in the comment.
    expect(firstSentence(effectOf("dc-topa-2-4-unit-exemption")).first).toBe(
      // "Under D.C."
      "Under D.C. Law 26-80 (eff. 2025-12-31), 2-4 unit accommodations are EXEMPT from TOPA unless the accommodation is majority-owned by a business CORPORATION ('majority ownership interests' = majority of the value of capital, profits, and losses).",
    );
    expect(firstSentence(effectOf("dc-rental-act-law-26-80")).first).toBe(
      // "ENACTED: RENTAL Amendment Act of 2025 = D.C."
      "ENACTED: RENTAL Amendment Act of 2025 = D.C. Law 26-80 (Bill B26-0164 -> Act 26-199 signed Nov 13, 2025 -> effective Dec 31, 2025 after congressional review).",
    );
    expect(firstSentence(effectOf("il-rent-control-preemption")).first).toBe(
      // "Illinois' Rent Control Preemption Act (50 ILCS 825, eff."
      "Illinois' Rent Control Preemption Act (50 ILCS 825, eff. Aug 1, 1997) bars every unit of local government - Chicago included - from controlling residential or commercial rents.",
    );
    expect(firstSentence(effectOf("ga-rent-control-preemption")).first).toBe(
      // "Georgia has prohibited local rent regulation since 1984: O.C.G.A."
      "Georgia has prohibited local rent regulation since 1984: O.C.G.A. 44-7-19 bars any county or municipality (Atlanta included) from regulating rent on private single-family or multiunit residential property.",
    );
    expect(firstSentence(effectOf("fl-rent-control-preemption")).first).toBe(
      // "Florida preempts local rent control (Fla."
      "Florida preempts local rent control (Fla. Stat. 166.043) - no Florida municipality (Miami included) has modern rent control, and landlords set market rates without caps.",
    );
    expect(firstSentence(effectOf("md-takoma-park-rent-stabilization")).first).toMatch(
      /^Takoma Park runs its OWN rent stabilization \(City Code Ch\. 6\.20\) on top of being inside Montgomery County: .*exemption comparable to DC\/PG\.$/,
    );
    expect(firstSentence(effectOf("il-chicago-rlto-owner-occupied-exemption")).first).toMatch(
      /\(Muni\. Code 5-12-020\), except the non-renewal notice rule \(5-12-130\) and the lockout ban \(5-12-160\) which apply regardless\.$/,
    );
    expect(firstSentence(effectOf("dc-rent-stab-coverage")).first).toBe(
      "Rental units in buildings whose building permit issued after Dec 31, 1975 are EXEMPT from DC rent stabilization (D.C. Code § 42-3502.05(a)(2)); pre-1976 stock is presumptively covered unless another exemption applies.",
    );
    expect(firstSentence(effectOf("ny-good-cause-eviction")).first).toMatch(
      /^NY Good Cause Eviction \(eff\. Apr 20, 2024; .*presumptively unreasonable\.$/,
    );
  });

  it("still ends a sentence at a period after a figure, a percent or a closing parenthesis", () => {
    expect(firstSentence("Caps rise at CPI-U + 3%, maximum 6%. Key exemptions follow.")).toEqual({
      first: "Caps rise at CPI-U + 3%, maximum 6%.",
      rest: "Key exemptions follow.",
    });
    expect(firstSentence("Built before 1987. Every 1-4 unit property is exempt.").first).toBe("Built before 1987.");
    expect(firstSentence("Capped (lesser of 4.5% or CPI-U). Annual allowance updates.").first).toBe(
      "Capped (lesser of 4.5% or CPI-U).",
    );
    expect(firstSentence("One sentence and no more.")).toEqual({ first: "One sentence and no more.", rest: "" });
  });

  it("never ends inside an unclosed parenthesis, at initials, or before a lower-case word", () => {
    expect(firstSentence("Covered (see § 4. The rest is open").rest).toBe("");
    expect(firstSentence("Set by the U.S. Treasury. Then more.").first).toBe("Set by the U.S. Treasury.");
    expect(firstSentence("Run by John A. Smith. Then more.").first).toBe("Run by John A. Smith.");
    expect(firstSentence("Roughly approx. the same. Then more.").first).toBe("Roughly approx. the same.");
  });

  it("keeps a rule's caution apart, so a page can hold it in view", () => {
    const parts = foldParts(effectOf("dc-topa-2-4-unit-exemption"));
    expect(parts.first).toMatch(/^Under D\.C\. Law 26-80/);
    expect(parts.cautions).toEqual([
      "CAUTION: statutory text not directly fetched; practitioner reading (Federal Title) is the source for the corporation-only nuance — verify the enacted definition before relying on entity structure.",
    ]);
    expect(parts.rest).toMatch(/^Per practitioner analysis/);
    expect(parts.rest).not.toContain("CAUTION");
    expect(isCaution("WATCH: a revival initiative")).toBe(false);
  });
});

/** Every string in a research file, wherever it sits. */
function stringsOf(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) for (const x of v) stringsOf(x, out);
  else if (v && typeof v === "object") for (const x of Object.values(v)) stringsOf(x, out);
  return out;
}

describe("every text in the research files reads to a whole first sentence", () => {
  const dir = join(process.cwd(), "data/research");
  const texts = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => stringsOf(JSON.parse(readFileSync(join(dir, f), "utf8"))).map((t) => ({ f, t })))
    .filter(({ t }) => /[.!?]\s/.test(t));

  it("finds the texts", () => {
    expect(texts.length).toBeGreaterThan(150);
    expect(RULES.length).toBeGreaterThan(20);
  });

  it("never ends a first sentence inside an open parenthesis or at a known abbreviation", () => {
    for (const { f, t } of texts) {
      const { first } = firstSentence(t);
      const open = (first.match(/[([]/g) ?? []).length;
      const close = (first.match(/[)\]]/g) ?? []).length;
      expect(open <= close, `${f}: an unclosed parenthesis in "${first}"`).toBe(true);
      const last = /([A-Za-z.]+)\.$/.exec(first)?.[1]?.replace(/^\.+/, "") ?? "";
      const abbreviated =
        ABBREVIATIONS.has(last.toLowerCase()) || (last !== "" && last.split(".").every((p) => p.length === 1));
      // A first sentence may end at an abbreviation only where it is the
      // whole text — a note of one sentence that happens to end "etc."
      expect(!abbreviated || first === t.trim(), `${f}: "${first}" ends at an abbreviation`).toBe(true);
    }
  });

  it("splits every rule into sentences that put the rule back together", () => {
    for (const r of RULES) {
      const s = sentencesOf(r.effect);
      expect(s.length, r.id).toBeGreaterThan(0);
      expect(s.join(" ").replace(/\s+/g, " "), r.id).toBe(r.effect.trim().replace(/\s+/g, " "));
    }
  });
});
