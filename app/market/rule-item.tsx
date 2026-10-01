import type { RegulatoryRule } from "@/lib/research";
import { foldParts } from "@/lib/first-sentence";

/**
 * One rule in force, as a market brief lists it: its status, its first
 * sentence, its source, any caution it carries in view, and the rest of
 * the rule one click away.
 *
 * The first sentence is lib/first-sentence's: cut at the first ". ", nine of
 * the rules on file printed a fragment — Washington's TOPA exemption read,
 * in full, "Under D.C.", Chicago's ended "(Muni.", Florida's "(Fla." — and
 * the TOPA rule's own "CAUTION: statutory text not directly fetched" was
 * never on the page (the research pass of 2026-10-01). A caution is never
 * folded. The link says "source", not "statute": a rule's source is as
 * often a county's page, a practitioner's note or a ballot record as the
 * code itself.
 *
 * Pure, so it renders on the rules file in lib/views.render.test.ts.
 */
export function RuleItem({ rule }: { rule: Pick<RegulatoryRule, "id" | "status" | "effect" | "source"> }) {
  const { first, cautions, rest } = foldParts(rule.effect);
  return (
    <li className="text-sm leading-snug" data-rule={rule.id}>
      <span
        className={`mr-2 rounded px-1.5 py-px text-[10px] font-medium ${
          rule.status === "verified"
            ? "bg-emerald-500/10 text-emerald-600"
            : rule.status === "sourced"
              ? "bg-brand/10 text-brand"
              : "bg-amber-500/10 text-amber-600"
        }`}
      >
        {rule.status}
      </span>
      {first}
      {rule.source && (
        <>
          {" "}
          <a
            href={rule.source}
            target="_blank"
            rel="noreferrer"
            className="ml-0.5 text-[11px] text-muted underline decoration-dotted underline-offset-2 hover:text-ink"
          >
            source
          </a>
        </>
      )}
      {cautions.length > 0 && (
        <p className="mt-1 text-xs font-medium leading-snug text-amber-700" data-qa="rule-caution">
          {cautions.join(" ")}
        </p>
      )}
      {rest && (
        <details className="mt-0.5 text-xs leading-relaxed text-muted">
          <summary className="cursor-pointer list-none text-[11px] font-medium text-brand [&::-webkit-details-marker]:hidden">
            the rest of the rule
          </summary>
          <p className="mt-1">{rest}</p>
        </details>
      )}
    </li>
  );
}
