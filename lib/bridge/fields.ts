/**
 * Leaf-level diffing, labelling and formatting for the Assumption Bridge.
 *
 * The bridge attributes an IRR move to the individual assumptions that caused
 * it, so it needs three things the engine itself doesn't provide: a way to
 * enumerate an assumption set's LEAF fields, a way to set one leaf on a copy,
 * and human labels/formats so a driver reads as "Exit cap 8.00% → 6.50%"
 * rather than "exitCapPct 0.08 → 0.065".
 *
 * Pure, typed, no I/O.
 */

/** A leaf value inside an assumption object. Arrays appear here only when the
 *  two sides being compared have DIFFERENT lengths — the array is then treated
 *  as one atomic driver ("Expense lines") rather than a set of index paths that
 *  don't line up between versions. */
export type LeafValue = number | string | boolean | null | undefined | unknown[];

/** Dotted path with numeric array segments, e.g. `expenseLines.0.annual`. */
export type FieldPath = string;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Read one leaf by path. Returns undefined when the path doesn't exist. */
export function getPath(obj: unknown, path: FieldPath): LeafValue {
  let cur: unknown = obj;
  for (const seg of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur as LeafValue;
}

/** Structured clone that preserves plain objects and arrays (the only shapes
 *  an assumption set contains). Avoids `structuredClone` so this stays usable
 *  in every runtime the app targets. */
export function cloneDeep<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => cloneDeep(v)) as unknown as T;
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = cloneDeep(v);
    return out as T;
  }
  return value;
}

/**
 * Return a copy of `obj` with `path` set to `value`. Intermediate containers
 * are created when missing (an array segment is a numeric key, so a new array
 * is created rather than an object). Never mutates the input.
 */
export function setPath<T>(obj: T, path: FieldPath, value: LeafValue): T {
  if (path === "") return cloneDeep(value) as unknown as T;
  const segs = path.split(".");
  const root = cloneDeep(obj) as unknown as Record<string, unknown>;
  let cur: Record<string, unknown> | unknown[] = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i];
    const next = (cur as Record<string, unknown>)[seg];
    if (next == null || typeof next !== "object") {
      const childIsIndex = /^\d+$/.test(segs[i + 1]);
      (cur as Record<string, unknown>)[seg] = childIsIndex ? [] : {};
    }
    cur = (cur as Record<string, unknown>)[seg] as Record<string, unknown>;
  }
  (cur as Record<string, unknown>)[segs[segs.length - 1]] = cloneDeep(value) as unknown;
  return root as unknown as T;
}

/** Float tolerance: a re-derived assumption set can differ in the 15th digit
 *  without anything having actually changed. Relative, with an absolute floor
 *  so near-zero values don't compare as "always different". */
export function valuesEqual(a: LeafValue, b: LeafValue): boolean {
  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    const diff = Math.abs(a - b);
    if (diff <= 1e-9) return true;
    const scale = Math.max(Math.abs(a), Math.abs(b));
    return diff <= scale * 1e-9;
  }
  return a === b;
}

/** Structural deep-equality for the atomic-array case. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual(a[k], b[k]));
  }
  return valuesEqual(a as LeafValue, b as LeafValue);
}

/**
 * The leaf paths whose values actually differ between two assumption sets —
 * the set `D` the Shapley walk runs over. Walks A and B in parallel so that an
 * array whose LENGTH changed collapses to a single atomic driver: index paths
 * that exist on one side only would otherwise be applied as `undefined` and
 * poison the model run they were meant to explain.
 *
 * Sorted for determinism, so the diff order — and therefore the bridge — never
 * depends on key insertion order.
 */
export function changedPaths(a: unknown, b: unknown): FieldPath[] {
  const out: FieldPath[] = [];

  const walk = (x: unknown, y: unknown, prefix: FieldPath): void => {
    const bothArrays = Array.isArray(x) && Array.isArray(y);
    if (bothArrays && (x as unknown[]).length === (y as unknown[]).length) {
      (x as unknown[]).forEach((_, i) => walk((x as unknown[])[i], (y as unknown[])[i], prefix ? `${prefix}.${i}` : String(i)));
      return;
    }
    if (isPlainObject(x) && isPlainObject(y)) {
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
        walk(x[k], y[k], prefix ? `${prefix}.${k}` : k);
      }
      return;
    }
    // Mismatched containers (a re-shaped array, an object vs a scalar) and
    // plain leaves both compare whole.
    if (!deepEqual(x, y)) out.push(prefix);
  };

  walk(a, b, "");
  return out.sort();
}

// ---------------------------------------------------------------------------
// Labels + formats
// ---------------------------------------------------------------------------

export type FieldFormat = "usd" | "usdPsf" | "pct" | "months" | "sf" | "number" | "text";

const LABELS: Record<string, { label: string; format: FieldFormat }> = {
  purchasePrice: { label: "Purchase price", format: "usd" },
  holdMonths: { label: "Hold period", format: "months" },
  acqFeePct: { label: "Acquisition fee %", format: "pct" },
  acqFeeCap: { label: "Acquisition fee cap", format: "usd" },

  transferTaxPct: { label: "Transfer tax", format: "pct" },
  recordationTaxPct: { label: "Recordation tax", format: "pct" },
  generalHoldPct: { label: "DD / closing hold", format: "pct" },
  buyerLegal: { label: "Buyer legal", format: "usd" },
  lenderLegal: { label: "Lender legal", format: "usd" },
  thirdPartyReports: { label: "Third-party reports", format: "usd" },
  miscClosing: { label: "Misc. closing costs", format: "usd" },

  inPlaceRentAnnual: { label: "In-place rental revenue", format: "usd" },
  expenseRecoveriesAnnual: { label: "Expense recoveries", format: "usd" },
  otherRevenueAnnual: { label: "Other revenue", format: "usd" },
  vacancyPct: { label: "Vacancy & credit loss", format: "pct" },
  rentGrowthPct: { label: "Rent growth", format: "pct" },

  mgmtFeePct: { label: "Management fee", format: "pct" },
  expenseGrowthPct: { label: "Expense growth", format: "pct" },

  rsf: { label: "Rentable SF", format: "sf" },
  reservesPsf: { label: "Capital reserves", format: "usdPsf" },
  capitalImprovementsYr1: { label: "Capital improvements (Yr 1)", format: "usd" },
  tiPsf: { label: "Tenant improvements", format: "usdPsf" },
  lcPct: { label: "Leasing commissions", format: "pct" },

  amFeePctEquity: { label: "Asset management fee", format: "pct" },

  ltc: { label: "Loan to cost", format: "pct" },
  allInRatePct: { label: "All-in rate", format: "pct" },
  ioMonths: { label: "Interest-only period", format: "months" },
  amortMonths: { label: "Amortization", format: "months" },
  financingCostPct: { label: "Financing costs", format: "pct" },

  exitCapPct: { label: "Exit cap", format: "pct" },
  saleCostPct: { label: "Sale costs", format: "pct" },
};

const humanize = (seg: string): string =>
  seg
    .replace(/Pct$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());

/**
 * A display label for a leaf path. Expense lines carry their own user-facing
 * label in the data, so `expenseLines.0.annual` reads as the line's own name
 * rather than an index.
 */
export function fieldLabel(path: FieldPath, assumptions?: unknown): string {
  const known = LABELS[path];
  if (known) return known.label;
  if (path === "expenseLines") return "Operating expense lines";
  if (path === "") return "Assumption set";

  const expense = /^expenseLines\.(\d+)\.annual$/.exec(path);
  if (expense) {
    const lineLabel = getPath(assumptions, `expenseLines.${expense[1]}.label`);
    return typeof lineLabel === "string" && lineLabel.trim()
      ? lineLabel.trim()
      : `Expense line ${Number(expense[1]) + 1}`;
  }
  const expenseName = /^expenseLines\.(\d+)\.label$/.exec(path);
  if (expenseName) return `Expense line ${Number(expenseName[1]) + 1} name`;

  const segs = path.split(".");
  return humanize(segs[segs.length - 1]);
}

/** Format kind for a leaf path, inferred from the key when not in the map. */
export function fieldFormat(path: FieldPath): FieldFormat {
  const known = LABELS[path];
  if (known) return known.format;
  if (/^expenseLines\.\d+\.annual$/.test(path)) return "usd";
  const last = path.split(".").pop() ?? "";
  if (/Pct$/.test(last)) return "pct";
  if (/Psf$/.test(last)) return "usdPsf";
  if (/Months$/.test(last)) return "months";
  if (/Annual$|Cap$|Legal$/.test(last)) return "usd";
  return "number";
}

const usd = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 10_000) return `${sign}$${Math.round(abs / 1000)}k`;
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
};

/** Render a leaf value for the bridge table / sentence. */
export function formatFieldValue(value: LeafValue, format: FieldFormat): string {
  if (value == null) return "—";
  if (Array.isArray(value)) return `${value.length} line${value.length === 1 ? "" : "s"}`;
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "string") return value;
  if (!Number.isFinite(value)) return "—";
  switch (format) {
    case "usd":
      return usd(value);
    case "usdPsf":
      return `$${value.toFixed(2)}/SF`;
    case "pct":
      return `${(value * 100).toFixed(2)}%`;
    case "months":
      return value % 12 === 0 && value !== 999
        ? `${value / 12} yr`
        : `${Math.round(value)} mo`;
    case "sf":
      return `${Math.round(value).toLocaleString("en-US")} SF`;
    default:
      return Math.abs(value) >= 1000
        ? Math.round(value).toLocaleString("en-US")
        : String(Number(value.toFixed(4)));
  }
}

/** Signed delta between two leaf values, phrased for the summary sentence
 *  ("cutting price by $1.7M", "tightening the exit cap from 8.00% to 6.50%"). */
export function formatFieldDelta(
  from: LeafValue,
  to: LeafValue,
  format: FieldFormat,
): string {
  if (typeof from !== "number" || typeof to !== "number") {
    return `${formatFieldValue(from, format)} → ${formatFieldValue(to, format)}`;
  }
  const d = to - from;
  const sign = d >= 0 ? "+" : "−";
  switch (format) {
    case "pct":
      return `${sign}${Math.abs(d * 10_000).toFixed(0)} bps`;
    case "usd":
      return `${sign}${usd(Math.abs(d))}`;
    case "usdPsf":
      return `${sign}$${Math.abs(d).toFixed(2)}/SF`;
    default:
      return `${sign}${formatFieldValue(Math.abs(d), format)}`;
  }
}
