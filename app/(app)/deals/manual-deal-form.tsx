"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createManualDeal,
  updateManualFacts,
  type ManualDealState,
} from "./actions";
import { AddressAutocomplete } from "../address-autocomplete";
import type { StructuredAddress } from "@/lib/address";
import { NOTES_MAX, type ManualDealFacts } from "@/lib/manual-deal";

/**
 * Type a deal in — no OM. One component serves both flows: creating a deal
 * from the pipeline ("create") and editing a manual deal's facts from its
 * page ("edit"). Inputs are CONTROLLED and errors return inline via
 * useActionState, so a validation miss never costs the user their typing.
 */
export function ManualDealForm({
  mode,
  dealId,
  initial,
  initialAddress,
}: {
  mode: "create" | "edit";
  dealId?: string;
  initial?: ManualDealFacts | null;
  initialAddress?: StructuredAddress | null;
}) {
  const [state, formAction] = useActionState<ManualDealState, FormData>(
    mode === "edit" ? updateManualFacts : createManualDeal,
    null,
  );

  const [name, setName] = useState(initial?.name ?? "");
  const [assetClass, setAssetClass] = useState(
    initial?.assetClass && initial.assetClass !== "auto"
      ? initial.assetClass
      : "multifamily",
  );
  const [price, setPrice] = useState(fmtNum(initial?.price));
  const [cap, setCap] = useState(fmtPlain(initial?.capPct));
  const [noi, setNoi] = useState(fmtNum(initial?.noiAnnual));
  const [units, setUnits] = useState(fmtPlain(initial?.units));
  const [sf, setSf] = useState(fmtNum(initial?.sf));
  const [occupancy, setOccupancy] = useState(fmtPlain(initial?.occupancyPct));
  const [yearBuilt, setYearBuilt] = useState(fmtPlain(initial?.yearBuilt));
  const [avgRent, setAvgRent] = useState(fmtNum(initial?.avgRentMo));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  // The autocomplete manages its own text; mirror nothing — the hidden
  // inputs it renders carry the pick + raw text into the form data. The seed
  // is computed once (lazy initializer) so edits never remount-reset it.
  const [addressSeed] = useState<StructuredAddress | null>(
    () =>
      initialAddress ??
      (initial?.address
        ? {
            label: initial.address,
            street: "",
            city: "",
            state: "",
            zip: "",
            county: "",
            submarket: "",
          }
        : null),
  );

  const field =
    "w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40";

  return (
    <form action={formAction} className="space-y-3">
      {mode === "edit" && dealId && (
        <input type="hidden" name="dealId" value={dealId} />
      )}

      {state?.error && (
        <p role="alert" className="rounded-lg bg-kill/10 px-3 py-2 text-sm text-kill">
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Deal name"
          placeholder="Deal name — e.g. 4-unit on Maple St"
          className={`${field} flex-1`}
        />
        <select
          name="assetClass"
          value={assetClass}
          onChange={(e) => setAssetClass(e.target.value)}
          aria-label="Asset class"
          className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <option value="multifamily">Multifamily</option>
          <option value="office">Office</option>
          <option value="industrial">Industrial</option>
          <option value="retail">Retail</option>
        </select>
      </div>

      <AddressAutocomplete
        name="address"
        textName="addressText"
        defaultValue={addressSeed}
        placeholder="Property address (optional) — start typing for suggestions"
        className={field}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Labeled label="Asking price" hint="required*">
          <input
            name="price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            placeholder="1,250,000 or 1.25m"
            aria-label="Asking price"
            className={field}
          />
        </Labeled>
        <Labeled label="Going-in cap %">
          <input
            name="cap"
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            inputMode="decimal"
            placeholder="5.75"
            aria-label="Going-in cap rate percent"
            className={field}
          />
        </Labeled>
        <Labeled label="NOI (annual $)">
          <input
            name="noi"
            value={noi}
            onChange={(e) => setNoi(e.target.value)}
            inputMode="decimal"
            placeholder="78,000"
            aria-label="Net operating income, annual dollars"
            className={field}
          />
        </Labeled>
        <Labeled label="Units">
          <input
            name="units"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            inputMode="numeric"
            placeholder="4"
            aria-label="Unit count"
            className={field}
          />
        </Labeled>
        <Labeled label="Building SF">
          <input
            name="sf"
            value={sf}
            onChange={(e) => setSf(e.target.value)}
            inputMode="decimal"
            placeholder="3,600"
            aria-label="Building square feet"
            className={field}
          />
        </Labeled>
        <Labeled label="Occupancy %">
          <input
            name="occupancy"
            value={occupancy}
            onChange={(e) => setOccupancy(e.target.value)}
            inputMode="decimal"
            placeholder="100"
            aria-label="Occupancy percent"
            className={field}
          />
        </Labeled>
        <Labeled label="Year built">
          <input
            name="yearBuilt"
            value={yearBuilt}
            onChange={(e) => setYearBuilt(e.target.value)}
            inputMode="numeric"
            placeholder="1968"
            aria-label="Year built"
            className={field}
          />
        </Labeled>
        <Labeled label="Avg rent ($/unit/mo)">
          <input
            name="avgRent"
            value={avgRent}
            onChange={(e) => setAvgRent(e.target.value)}
            inputMode="decimal"
            placeholder="1,450"
            aria-label="Average in-place rent per unit per month"
            className={field}
          />
        </Labeled>
      </div>

      <div>
        <textarea
          name="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          maxLength={NOTES_MAX}
          aria-label="Anything else about the deal"
          placeholder="Anything else — condition, tenancy, the story, your reno plan. e.g. original 1968 interiors, all four units month-to-month at $1,250–1,400, roof replaced 2019, seller retiring, plan is $20k/unit interior refresh then re-lease at market. The challenger and market check read every word of this."
          className={`${field} resize-y`}
        />
        <p className="mt-1 flex justify-between text-xs text-muted">
          <span>
            The more context you give, the sharper the challenge — paste your
            whole notes file if you like.
          </span>
          <span className="shrink-0 pl-3 font-mono tabular-nums">
            {notes.length.toLocaleString("en-US")}/{NOTES_MAX.toLocaleString("en-US")}
          </span>
        </p>
      </div>

      <p className="text-xs leading-relaxed text-muted">
        *Enough to screen = the asking price — or NOI + cap rate, and the price
        gets derived. Everything else sharpens the analysis: the challenger and
        market check run on exactly what you give them.
      </p>

      <SubmitButton mode={mode} />
    </form>
  );
}

function Labeled({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">
        {label}
        {hint && <span className="ml-1 font-normal text-brand">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function SubmitButton({ mode }: { mode: "create" | "edit" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending
        ? mode === "edit"
          ? "Saving & re-screening…"
          : "Creating your deal…"
        : mode === "edit"
          ? "Save facts & re-screen"
          : "Create & screen"}
    </button>
  );
}

const fmtNum = (n: number | null | undefined): string =>
  n == null ? "" : Math.round(n).toLocaleString("en-US");
const fmtPlain = (n: number | null | undefined): string =>
  n == null ? "" : String(n);
