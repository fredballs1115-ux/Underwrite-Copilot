"use client";

import { useState } from "react";
import { deleteAccount } from "./actions";
import { PendingButton } from "../pending-button";

/** Type-to-confirm account deletion — the server re-checks the phrase. */
export function DeleteAccountForm() {
  const [value, setValue] = useState("");
  const armed = value.trim() === "DELETE";

  return (
    <form action={deleteAccount} className="mt-4 flex flex-wrap items-center gap-2">
      <input
        name="confirm"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder='Type "DELETE" to confirm'
        aria-label="Type DELETE to confirm account deletion"
        autoComplete="off"
        className="w-56 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none transition-shadow focus:border-kill focus-visible:ring-2 focus-visible:ring-kill/30"
      />
      <PendingButton
        disabled={!armed}
        pendingLabel="Deleting your account…"
        className="rounded-lg bg-kill px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        Delete my account
      </PendingButton>
    </form>
  );
}
