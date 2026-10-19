// The recorded sales' "Download CSV" (lib/public-comps/picture `compsCsv`):
// a table and nothing else, a row a sale in the list's order with its pin
// number, the numbers raw, every text cell through lib/csv-cell's escaper
// (the pipeline CSV's own, and the only one), a shared-deed flag, and the
// dataset with its retrieval day on every row.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { addressSlug, compsCsv, compsCsvFileName, salesOrder, type CompsCsvSource } from "./picture";
import type { RecordComp } from "./core";
import { csvNumber, csvText } from "@/lib/csv-cell";

const comp = (over: Partial<RecordComp>): RecordComp => ({
  address: "1 Main St",
  lat: 0,
  lng: 0,
  saleDate: "2026-05-01",
  price: 500_000,
  sqft: null,
  propertyType: "RESIDENTIAL",
  distanceKm: 1,
  sourceUrl: "https://example.gov/1",
  ...over,
});

const source = (comps: RecordComp[]): CompsCsvSource => ({
  comps,
  providerName: "Philadelphia OPA",
  datasetUrl: "https://opendataphilly.org/",
  retrievedAt: "2026-10-08T12:00:00Z",
  subject: { lat: 39.95, lng: -75.16, label: "1500 Walnut St, Philadelphia, PA" },
});

/** RFC 4180's reading: quoted fields, doubled quotes, a comma between. */
function parse(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (quoted) {
      if (ch === '"' && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

describe("csvText and csvNumber, the one escaper", () => {
  it("leads a formula-opening cell with an apostrophe and quotes every text cell", () => {
    expect(csvText("=HYPERLINK(\"http://x\")")).toBe(`"'=HYPERLINK(""http://x"")"`);
    for (const lead of ["=", "+", "-", "@", "\t", "\r"]) expect(csvText(`${lead}1`)).toBe(`"'${lead}1"`);
    expect(csvText("Smith, John")).toBe('"Smith, John"');
    expect(csvText("")).toBe('""');
  });

  it("writes a number raw and a missing one blank, never NaN", () => {
    expect(csvNumber(1_250_000)).toBe("1250000");
    expect(csvNumber(0.85)).toBe("0.85");
    expect(csvNumber(null)).toBe("");
    expect(csvNumber(undefined)).toBe("");
    expect(csvNumber(Number.NaN)).toBe("");
    expect(csvNumber(Infinity)).toBe("");
  });

  it("is the only formula escaper in the sources: the pipeline's CSV writes through it", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(p);
      }
    };
    walk("app");
    walk("lib");
    const escapers = files.filter((f) => readFileSync(f, "utf8").includes("^[=+\\-@"));
    expect(escapers).toEqual([join("lib", "csv-cell.ts")]);
    const pipeline = readFileSync("app/(app)/deals/pipeline.tsx", "utf8");
    expect(pipeline).toContain('import { csvText } from "@/lib/csv-cell"');
    expect(pipeline).toMatch(/const esc = csvText;/);
  });
});

describe("compsCsv", () => {
  const comps = [
    comp({ address: "100 Walnut St", price: 400_000, sqft: 1_600, saleDate: "2026-03-15", distanceKm: 0.5, buyer: "ACME LLC", seller: "=cmd|' /C calc'!A0", deedType: "DEED" }),
    comp({ address: "200 Walnut St, Unit \"B\"", price: 1_250_000.4, sqft: null, units: 4, saleDate: "2026-07-01", distanceKm: 1.609344, buyer: "+BIG HOLDINGS", deedType: "DEED" }),
    comp({ address: "201 Walnut St", price: 1_250_000.4, sqft: null, units: 4, saleDate: "2026-07-01", distanceKm: 2, buyer: "+BIG HOLDINGS" }),
  ];

  it("is a header and a row a sale, nothing above or below it", () => {
    const rows = parse(compsCsv(source(comps)));
    expect(rows).toHaveLength(1 + comps.length);
    expect(rows[0]).toEqual([
      "#",
      "Sold",
      "Address",
      "Price",
      "$/SF",
      "Units",
      "$/unit",
      "Type",
      "Buyer",
      "Seller",
      "Deed type",
      "Miles",
      "Record",
      "Possibly one deed across parcels (rows sharing its day, buyer and price)",
      "Dataset",
      "Dataset URL",
      "Retrieved",
    ]);
    // Every row as wide as the header.
    for (const r of rows) expect(r).toHaveLength(rows[0].length);
    // No trailing line, no comment row.
    expect(compsCsv(source(comps)).endsWith("\n")).toBe(false);
  });

  it("writes the numbers raw — no $, no commas, unquoted — and a blank blank", () => {
    const lines = compsCsv(source(comps)).split("\n");
    // The second sale: pin 2, price rounded, no area, 4 units, a unit's price, a mile.
    expect(lines[2].startsWith('2,"2026-07-01",')).toBe(true);
    const rows = parse(compsCsv(source(comps)));
    expect(rows[1].slice(3, 7)).toEqual(["400000", "250", "", ""]);
    expect(rows[2].slice(3, 7)).toEqual(["1250000", "", "4", "312500"]);
    expect(rows[1][11]).toBe("0.31");
    expect(rows[2][11]).toBe("1");
    expect(lines.join("\n")).not.toMatch(/\$\d/);
    expect(rows.slice(1).every((r) => [3, 4, 5, 6, 11].every((i) => r[i] === "" || /^\d+(\.\d+)?$/.test(r[i])))).toBe(true);
  });

  it("escapes every text cell against formula injection, the pipeline's way", () => {
    const rows = parse(compsCsv(source(comps)));
    expect(rows[1][9]).toBe("'=cmd|' /C calc'!A0");
    expect(rows[2][8]).toBe("'+BIG HOLDINGS");
    expect(rows[2][2]).toBe('200 Walnut St, Unit "B"');
    // A text cell's value is quoted in the file.
    expect(compsCsv(source(comps)).split("\n")[1]).toContain(`"'=cmd|' /C calc'!A0"`);
  });

  it("flags the rows that may be one deed across parcels, and only those", () => {
    const rows = parse(compsCsv(source(comps)));
    expect(rows.slice(1).map((r) => r[13])).toEqual(["", "2", "2"]);
  });

  it("carries the dataset and its retrieval day on every row", () => {
    const rows = parse(compsCsv(source(comps)));
    for (const r of rows.slice(1)) expect(r.slice(14)).toEqual(["Philadelphia OPA", "https://opendataphilly.org/", "2026-10-08"]);
  });

  it("follows the list's order, each row keeping its pin number, and lists every sale", () => {
    const many = Array.from({ length: 15 }, (_, i) => comp({ address: `${i} Pine St`, price: 100_000 + ((i * 7) % 15) * 10_000 }));
    const order = salesOrder(many, "price");
    const rows = parse(compsCsv(source(many), order));
    expect(rows).toHaveLength(16); // all fifteen, not the twelve the list shows
    expect(rows.slice(1).map((r) => Number(r[0]))).toEqual(order.map((at) => at + 1));
    const prices = rows.slice(1).map((r) => Number(r[3]));
    expect(prices).toEqual([...prices].sort((a, b) => b - a));
    // Nearest first by default.
    expect(parse(compsCsv(source(many))).slice(1).map((r) => r[0])).toEqual(many.map((_, i) => String(i + 1)));
  });
});

describe("the download's name", () => {
  it("carries the address's slug and the retrieval day", () => {
    expect(compsCsvFileName(source([]))).toBe("recorded-sales-1500-walnut-st-philadelphia-pa-2026-10-08.csv");
    expect(compsCsvFileName({ subject: undefined, retrievedAt: "" })).toBe("recorded-sales-address.csv");
  });

  it("keeps a slug to letters, digits and hyphens", () => {
    expect(addressSlug("  Café Façade, 12 Rue de l'Église / Montréal  ")).toBe("cafe-facade-12-rue-de-l-eglise-montreal");
    expect(addressSlug("../../etc/passwd")).toBe("etc-passwd");
    expect(addressSlug("x".repeat(80))).toHaveLength(60);
    expect(addressSlug("!!!")).toBe("address");
  });
});
