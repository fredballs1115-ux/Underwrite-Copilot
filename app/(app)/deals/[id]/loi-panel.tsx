"use client";

import { useState } from "react";
import Link from "next/link";
import { parseUsd } from "@/lib/money";

/**
 * LOI draft: a prefilled, editable form → a .docx download. The numbers come
 * from the screen (asking price) but every field is the analyst's to change —
 * this drafts the paper, it doesn't decide the offer.
 */
export function LoiPanel({
  dealId,
  askingPrice,
  isPro,
}: {
  dealId: string;
  /** the extraction's asking-price string, "" when unknown */
  askingPrice: string;
  isPro: boolean;
}) {
  const prefill = parseUsd(askingPrice);
  const [buyer, setBuyer] = useState("");
  const [price, setPrice] = useState(prefill ? String(prefill) : "");
  const [deposit, setDeposit] = useState(
    prefill ? String(Math.round(prefill * 0.01)) : "",
  );
  const [dd, setDd] = useState("30");
  const [close, setClose] = useState("30");
  const [withDebt, setWithDebt] = useState(true);
  const [ltv, setLtv] = useState("60");

  // Parse before navigating: "$63.5M" is welcome, "sixty million" is caught
  // here instead of bouncing the page (which would wipe the typed fields).
  const priceN = parseUsd(price);
  const depositN = parseUsd(deposit, 100);
  const ready = priceN !== null && depositN !== null && depositN <= priceN;

  const href =
    `/api/deals/${dealId}/loi?` +
    new URLSearchParams({
      buyer,
      // Send the parsed canonical dollars so the letter states exactly the
      // figure previewed here, whatever shorthand was typed.
      price: priceN !== null ? String(priceN) : price,
      deposit: depositN !== null ? String(depositN) : deposit,
      dd,
      close,
      open: "7",
      ...(withDebt ? { ltv } : {}),
    }).toString();

  const hint =
    price.trim() === "" || deposit.trim() === ""
      ? "Fill in the offer price and deposit first."
      : priceN === null || depositN === null
        ? "Enter the amounts in dollars — 63000000, $63.5M, and 500k all work."
        : depositN > priceN
          ? "The deposit is larger than the offer price — double-check the two figures."
          : null;

  const field =
    "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-brand/30";

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold tracking-tight">LOI draft</h2>
        {!isPro && (
          <span className="rounded-full bg-brand/10 px-1.5 py-px text-[10px] font-semibold text-brand">
            Pro
          </span>
        )}
      </div>
      <p className="mt-0.5 max-w-lg text-xs leading-relaxed text-muted">
        A one-page, non-binding letter of intent as an editable Word file —
        prefilled from the screen, yours to mark up. Have counsel review
        before anything is sent or signed.
      </p>

      {!isPro ? (
        <p className="mt-3 text-sm text-muted">
          The LOI draft is part of Pro —{" "}
          <Link
            href="/billing"
            className="font-medium text-brand underline-offset-2 hover:underline"
          >
            upgrade on the Billing page
          </Link>{" "}
          to generate it.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-muted">
            Buyer / entity name
            <input
              value={buyer}
              onChange={(e) => setBuyer(e.target.value)}
              maxLength={120}
              placeholder="e.g. Cascade Capital Partners LLC"
              className={`mt-1 ${field}`}
            />
          </label>
          <label className="block text-xs font-medium text-muted">
            Offer price (USD)
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 63000000"
              className={`mt-1 ${field}`}
            />
          </label>
          <label className="block text-xs font-medium text-muted">
            Earnest deposit (USD)
            <input
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 630000"
              className={`mt-1 ${field}`}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-muted">
              Due diligence (days)
              <input
                value={dd}
                onChange={(e) => setDd(e.target.value)}
                inputMode="numeric"
                className={`mt-1 ${field}`}
              />
            </label>
            <label className="block text-xs font-medium text-muted">
              Close after DD (days)
              <input
                value={close}
                onChange={(e) => setClose(e.target.value)}
                inputMode="numeric"
                className={`mt-1 ${field}`}
              />
            </label>
          </div>
          <div className="flex items-center gap-3 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={withDebt}
                onChange={(e) => setWithDebt(e.target.checked)}
                className="h-4 w-4 rounded border-line accent-brand"
              />
              Financing contingency
            </label>
            {withDebt && (
              <label className="flex items-center gap-1.5 text-sm text-muted">
                up to
                <input
                  value={ltv}
                  onChange={(e) => setLtv(e.target.value)}
                  inputMode="numeric"
                  className="w-14 rounded-lg border border-line bg-surface px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
                % LTV
              </label>
            )}
          </div>
          <div className="sm:col-span-2">
            <a
              href={ready ? href : undefined}
              aria-disabled={!ready}
              className={`inline-block rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
                ready
                  ? "bg-brand hover:bg-brand-strong"
                  : "cursor-not-allowed bg-brand/40"
              }`}
            >
              Download LOI draft (.docx)
            </a>
            {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
