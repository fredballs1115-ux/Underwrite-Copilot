import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { buildUnderwriteWorkbook } from "@/lib/underwrite/workbook";
import { SAMPLE_DEAL } from "@/lib/sample-deal";

export const runtime = "nodejs";

// The fixture never changes, so build the workbook once per process and serve
// the same bytes: this is a public unauthenticated route, and Render doesn't
// edge-cache dynamic responses, so without this every request would pay a
// full ExcelJS build. The promise (not the buffer) is cached so concurrent
// first hits share one build; a failed build clears the slot to allow retry.
let cachedBuild: Promise<Buffer> | null = null;

function getSampleWorkbook(): Promise<Buffer> {
  if (!cachedBuild) {
    const derived = deriveUnderwriteInputs(
      SAMPLE_DEAL.extraction,
      SAMPLE_DEAL.name,
      {
        rentRoll: {
          summary: SAMPLE_DEAL.rentRoll.summary,
          asOf: SAMPLE_DEAL.rentRoll.as_of_date,
        },
        t12: {
          summary: SAMPLE_DEAL.t12.summary,
          periodEnd: SAMPLE_DEAL.t12.period_end_date,
        },
      },
    );
    cachedBuild = buildUnderwriteWorkbook(derived).catch((err) => {
      cachedBuild = null;
      throw err;
    });
  }
  return cachedBuild;
}

/**
 * The sample deal's live-formula underwriting workbook as a PUBLIC download —
 * the actual deliverable, not a screenshot of it. Pure fixture data through
 * the same derivation + builder the product ships (actuals folded in, so the
 * workbook's base case matches the /demo playground's).
 */
export async function GET() {
  try {
    const buffer = await getSampleWorkbook();
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="sample-underwrite-copilot.xlsx"',
        // Fixture-only output — safe to cache at the edge for a day.
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    console.error("sample workbook build failed", err);
    return new Response("Sample workbook unavailable", { status: 500 });
  }
}
