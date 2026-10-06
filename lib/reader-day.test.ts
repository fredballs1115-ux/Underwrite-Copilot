// The reader's own calendar day (lib/reader-day). The signed-in pages had
// counted "today" from the UTC day, so from 8 pm Eastern (5 pm Pacific) a
// deal due tomorrow read "Offers due today" and a task due tomorrow read as
// due today. The day is the reader's now: their browser's zone, written to a
// cookie and read by the server once per request.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_TIME_ZONE,
  TZ_COOKIE,
  cookieValueOf,
  dayIn,
  readerDateLong,
  readerTimeZone,
  readerToday,
  tzCookieUpdate,
  validTimeZone,
} from "./reader-day";

const at = (iso: string) => new Date(iso);

describe("readerTimeZone — the zone the cookie names, else Eastern", () => {
  it("reads a zone the runtime lists, written plain or encoded", () => {
    expect(readerTimeZone("America/Los_Angeles")).toBe("America/Los_Angeles");
    expect(readerTimeZone("America%2FLos_Angeles")).toBe("America/Los_Angeles");
    expect(readerTimeZone(" Pacific/Honolulu ")).toBe("Pacific/Honolulu");
    expect(readerTimeZone("UTC")).toBe("UTC");
    // A name a browser reports that the list files under another is read
    // through Intl, and keeps the zone's own day.
    const kolkata = validTimeZone("Asia/Kolkata");
    expect(kolkata).not.toBeNull();
    expect(dayIn(kolkata!, at("2026-10-04T19:00:00Z"))).toBe("2026-10-05");
  });

  it("falls back to Eastern for a cookie that is absent, empty or names no zone", () => {
    expect(DEFAULT_TIME_ZONE).toBe("America/New_York");
    for (const raw of [undefined, null, "", "   ", "Mars/Olympus_Mons", "America/New_York; secure", "../../etc/passwd", "%E0%A4%A", "A".repeat(80), "<script>"]) {
      expect(readerTimeZone(raw), String(raw)).toBe("America/New_York");
    }
  });
});

describe("dayIn and readerToday — a day near midnight", () => {
  it("is New York's and Los Angeles's own day, not UTC's", () => {
    // 11:30 pm Eastern and 8:30 pm Pacific on Oct 4: UTC is already Oct 5.
    const lateEvening = at("2026-10-05T03:30:00Z");
    expect(lateEvening.toISOString().slice(0, 10)).toBe("2026-10-05");
    expect(dayIn("America/New_York", lateEvening)).toBe("2026-10-04");
    expect(dayIn("America/Los_Angeles", lateEvening)).toBe("2026-10-04");
    expect(dayIn("UTC", lateEvening)).toBe("2026-10-05");
    // Half past midnight in New York is the next day there, still 9:30 pm in
    // Los Angeles.
    const newYorkMidnight = at("2026-10-05T04:30:00Z");
    expect(dayIn("America/New_York", newYorkMidnight)).toBe("2026-10-05");
    expect(dayIn("America/Los_Angeles", newYorkMidnight)).toBe("2026-10-04");
    // A minute either side of midnight in Los Angeles.
    expect(dayIn("America/Los_Angeles", at("2026-10-05T06:59:00Z"))).toBe("2026-10-04");
    expect(dayIn("America/Los_Angeles", at("2026-10-05T07:00:00Z"))).toBe("2026-10-05");
    // Standard time moves the boundary an hour: 11:30 pm Eastern on Nov 30.
    expect(dayIn("America/New_York", at("2026-12-01T04:30:00Z"))).toBe("2026-11-30");
  });

  it("reads the cookie's zone, and Eastern's day without one", () => {
    const lateEvening = at("2026-10-05T03:30:00Z");
    expect(readerToday(undefined, lateEvening)).toBe("2026-10-04");
    expect(readerToday("America/Los_Angeles", at("2026-10-05T06:30:00Z"))).toBe("2026-10-04");
    expect(readerToday("not a zone", at("2026-10-05T06:30:00Z"))).toBe("2026-10-05");
    expect(readerToday("Europe/London", lateEvening)).toBe("2026-10-05");
  });
});

// Research pass 35 (F5): the letter of intent, the memo and the report were
// dated by the server's clock, which runs UTC — from 8 pm Eastern a letter
// was dated tomorrow, and "open for acceptance for 7 days from the date
// above" ran from a day that had not come.
describe("readerDateLong — a document's date, on the reader's day", () => {
  it("at 11:30 pm in New York is that evening's date, though UTC has turned", () => {
    const lateEvening = at("2026-10-06T03:30:00Z");
    expect(lateEvening.toISOString().slice(0, 10)).toBe("2026-10-06");
    expect(readerDateLong("America/New_York", lateEvening)).toBe("October 5, 2026");
    expect(readerDateLong("America%2FNew_York", lateEvening)).toBe("October 5, 2026");
    // No cookie (a reader's first page): Eastern's day.
    expect(readerDateLong(undefined, lateEvening)).toBe("October 5, 2026");
    // 8:30 pm in Los Angeles; past midnight in London and in UTC.
    expect(readerDateLong("America/Los_Angeles", lateEvening)).toBe("October 5, 2026");
    expect(readerDateLong("Europe/London", lateEvening)).toBe("October 6, 2026");
    expect(readerDateLong("UTC", lateEvening)).toBe("October 6, 2026");
  });

  it("writes the long form the documents print, across a month's and a year's end", () => {
    expect(readerDateLong("America/New_York", at("2026-11-01T03:30:00Z"))).toBe("October 31, 2026");
    expect(readerDateLong("America/New_York", at("2027-01-01T04:30:00Z"))).toBe("December 31, 2026");
    expect(readerDateLong("Pacific/Honolulu", at("2026-10-05T20:00:00Z"))).toBe("October 5, 2026");
  });
});

describe("the cookie the browser writes", () => {
  it("reads one cookie out of document.cookie", () => {
    expect(cookieValueOf("a=1; uc_tz=America%2FChicago; b=2", TZ_COOKIE)).toBe("America%2FChicago");
    expect(cookieValueOf("a=1; b=2", TZ_COOKIE)).toBeNull();
    expect(cookieValueOf("", TZ_COOKIE)).toBeNull();
    expect(cookieValueOf("xuc_tz=Asia/Tokyo", TZ_COOKIE)).toBeNull();
  });

  it("writes the browser's zone for a year where the cookie does not hold it, and says whether the day moves", () => {
    // 10 pm Pacific, 1 am Eastern: the server read New York's Oct 5.
    const write = tzCookieUpdate(null, "America/Los_Angeles", { secure: true, now: at("2026-10-05T05:00:00Z") });
    expect(write).toEqual({
      cookie: "uc_tz=America%2FLos_Angeles; path=/; max-age=31536000; samesite=lax; secure",
      value: "America%2FLos_Angeles",
      dayMoves: true,
    });
    // Mid-afternoon both coasts share the day: written, nothing to redraw.
    expect(tzCookieUpdate(null, "America/Los_Angeles", { secure: false, now: at("2026-10-05T20:00:00Z") })).toEqual({
      cookie: "uc_tz=America%2FLos_Angeles; path=/; max-age=31536000; samesite=lax",
      value: "America%2FLos_Angeles",
      dayMoves: false,
    });
    // A move from one zone to another is written too.
    expect(tzCookieUpdate("America%2FNew_York", "America/Chicago", { secure: true, now: at("2026-10-05T04:30:00Z") })?.dayMoves).toBe(true);
  });

  it("writes nothing where the cookie already holds the zone, or the browser reports none", () => {
    const now = at("2026-10-05T05:00:00Z");
    expect(tzCookieUpdate("America%2FLos_Angeles", "America/Los_Angeles", { secure: true, now })).toBeNull();
    expect(tzCookieUpdate("America/Los_Angeles", "America/Los_Angeles", { secure: true, now })).toBeNull();
    for (const junk of [undefined, null, "", "Etc/Unknown; path=/admin", "x".repeat(80)]) {
      expect(tzCookieUpdate(null, junk, { secure: true, now }), String(junk)).toBeNull();
    }
  });
});

// The pages' props: each signed-in surface that says "today" or counts the
// days to a date reads its day through `readerToday`, once per request, and
// hands it down — and the signed-in layout writes the cookie it reads.
function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("the signed-in pages count from the reader's day", () => {
  const root = process.cwd();
  const read = (rel: string) => readFileSync(join(root, rel), "utf8");

  it("the pipeline, the deal page, the rent roll and its workbook read the day through readerToday", () => {
    for (const rel of [
      "app/(app)/deals/page.tsx",
      "app/(app)/deals/[id]/page.tsx",
      "app/(app)/deals/[id]/rent-roll/page.tsx",
      "app/api/deals/[id]/rent-roll.xlsx/route.ts",
    ]) {
      const src = read(rel);
      expect(src, rel).toMatch(/readerToday\(\s*\(await cookies\(\)\)\.get\(TZ_COOKIE\)\?\.value\s*\)/);
      expect(src, rel).not.toContain("new Date().toISOString().slice(0, 10)");
    }
    // The day reaches every countdown as a prop.
    expect(read("app/(app)/deals/page.tsx")).toContain("todayIso={todayIso}");
    const deal = read("app/(app)/deals/[id]/page.tsx");
    expect(deal).toContain("today={todayIso}");
    expect(deal).toContain("todayIso={todayIso}");
    // Every deal-type panel that says "today", counts the days to a date or
    // reads a date as passed reads the reader's noon — the sale's bid
    // deadline, a lease's or a restriction's end, the abatement's, the
    // franchise's, a Phase I's age (audit C2 named the first reads; these
    // had kept the server's clock).
    for (const call of [
      "readSale(extraction, readerNoon)",
      "readAffordable(extraction, readerNoon)",
      "readSingleTenant(extraction, readerNoon)",
      "readRoster(extraction, readerNoon)",
      "readTaxAbatement(extraction, readerNoon)",
      "readHotelDeal(extraction, readerNoon)",
      "readSiteReports(extraction, readerNoon)",
      "readSandwichLease(extraction, readerNoon)",
      "readForwardPurchase(extraction, readerNoon, strategy)",
      "readGoingConcern(extraction, readerNoon)",
      "readMixedUse(extraction, readerNoon)",
      "readCondo(extraction, readerNoon)",
      "exchangeForDeal(buyBox?.exchange, extraction, offersDue, readerNoon)",
    ]) {
      expect(deal, call).toContain(call);
    }
    expect(deal.match(/new Date\(`\$\{todayIso\}T12:00:00Z`\)/g) ?? [], "the reader's noon is built once").toHaveLength(1);
    // The model's lines read the same day as the panels beside them: the
    // derivation's dated readers (DealForModel.asOf) and the sale panel's
    // ceiling (research pass 40, item 14).
    expect(deal).toMatch(/deriveUnderwriteInputs\([\s\S]*?\{ regulation, asOf: readerNoon \},?\s*\)/);
    expect(deal).toContain("saleCeiling(extraction, shown.inputs, buyBox?.minIrrPct ?? SALE_HURDLE_PCT, readerNoon)");
    // The report reads its model on the day it is dated, at its noon.
    const report = read("app/api/deals/[id]/report/route.ts");
    expect(report).toContain("const readerNoon = new Date(`${readerDay}T12:00:00Z`);");
    expect(report).toContain("{ regulation: regulationRead, asOf: readerNoon }");
    for (const call of [
      "readAssumable(extraction, derived.inputs, readerNoon)",
      "readLeaseholdExit(extraction, derived.inputs, readerNoon)",
      "saleCeilingRead(extraction, derived.inputs, hurdlePct ?? SALE_HURDLE_PCT, readerNoon)",
    ]) {
      expect(report, call).toContain(call);
    }
    // The rent-roll workbook's model reads the reader's day it counts from.
    expect(read("app/api/deals/[id]/rent-roll.xlsx/route.ts")).toContain("new Date(`${readerDay}T12:00:00Z`)");
    // And the underwriting workbook reads the reader's day as the report
    // does, its cover's dated lines, its rent rules and its interest read
    // on it: it had read the UTC day, so a Los Angeles reader at 8 pm saw a
    // lease ending today read "ended" in the workbook beside a page saying
    // it ends today (audit C4, L8).
    const workbook = read("app/api/deals/[id]/underwrite.xlsx/route.ts");
    expect(workbook).toMatch(/const readerDay = readerToday\(\(await cookies\(\)\)\.get\(TZ_COOKIE\)\?\.value\);/);
    expect(workbook).toContain("const asOf = new Date(`${readerDay}T12:00:00Z`);");
    expect(workbook).toMatch(/assetClass: deal\.asset_class as string \| null \},\s*readerDay,\s*\)/);
    expect(workbook).not.toContain("toISOString().slice(0, 10)");
    // Its cover's "Prepared" day is the reader's day the "from today" lines
    // count from, never the server's UTC day (audit C6, LOW-2).
    expect(workbook).toMatch(/buildUnderwriteWorkbook\(model, branding, marketRead, readPortfolio\(extraction\), asOf, findings, interest\)/);
  });

  // The documents' own date, read once per request from the cookie the
  // signed-in layout writes: the letter of intent, the memo and the report.
  it("the letter of intent, the memo and the report are dated through readerDateLong, never the server's clock", () => {
    for (const rel of ["app/api/deals/[id]/loi/route.ts", "app/api/deals/[id]/memo/route.ts", "app/api/deals/[id]/report/route.ts"]) {
      const src = read(rel);
      expect(src, rel).toMatch(/const dateStr = readerDateLong\(\s*(?:\(await cookies\(\)\)\.get\(TZ_COOKIE\)\?\.value|tz, now)\s*\)/);
      expect(src, rel).not.toMatch(/new Date\(\)\.toLocaleDateString\(/);
    }
    // The memo's and the report's files are named for the day they are
    // dated, and the rent rules they print are read on it: the filenames and
    // the regulation read had kept the server's UTC day (the audit of
    // 2026-10-05).
    for (const rel of ["app/api/deals/[id]/memo/route.ts", "app/api/deals/[id]/report/route.ts"]) {
      const src = read(rel);
      expect(src, rel).toMatch(/const tz = \(await cookies\(\)\)\.get\(TZ_COOKIE\)\?\.value;/);
      expect(src, rel).toMatch(/const readerDay = readerToday\(tz, now\);/);
      expect(src, rel).toMatch(/filename="\$\{safe\}-[a-z-]+-\$\{readerDay\}\.pdf"/);
      expect(src, rel).not.toContain("toISOString().slice(0, 10)");
    }
    expect(read("app/api/deals/[id]/report/route.ts")).toMatch(/assetClass: deal\.asset_class as string \| null,\s*\},\s*readerDay,\s*\)/);
  });

  it("the signed-in layout writes the cookie", () => {
    const layout = read("app/(app)/layout.tsx");
    expect(layout).toContain("<TimeZoneCookie />");
    const writer = read("app/(app)/time-zone-cookie.tsx");
    expect(writer).toContain('"use client"');
    expect(writer).toContain("Intl.DateTimeFormat().resolvedOptions().timeZone");
    expect(writer).toContain("tzCookieUpdate(");
  });

  // Every UTC day a signed-in page computes is either the reader's day in
  // disguise (a failure here) or one kept on purpose, said why.
  it("no other signed-in page computes the UTC day", () => {
    const KEPT: Record<string, string> = {
      // The day an imported pipeline file's rows are stored as of: shared
      // data, dated as every job and feed dates its rows.
      "app/(app)/submarkets/actions.ts": "the import's stored as-of day",
      // The day Ask's deal context reads the rent allowance in force on: a
      // Claude step's day, the UTC day every step is told it is
      // (lib/anthropic/today), as the screen's own steps read it.
      "app/(app)/deals/[id]/ask-actions.ts": "the rent rules in Ask's context, on a Claude step's UTC day",
    };
    const found = files(join(root, "app/(app)"))
      .map((p) => p.slice(root.length + 1))
      .filter((rel) => /toISOString\(\)\.slice\(0, ?10\)/.test(read(rel)));
    expect(found.sort()).toEqual(Object.keys(KEPT).sort());
  });
});
