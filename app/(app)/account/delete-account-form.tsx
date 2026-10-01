"use client";

import { useState } from "react";
import { deleteAccount } from "./actions";
import { PendingButton } from "../pending-button";
import type { DeletionDone } from "@/lib/account-deletion";

/** Type-to-confirm account deletion — the server re-checks the phrase. A
 *  try that stopped part way had already done something (handed the team's
 *  deals over, cancelled the plan), and the next try carries that in, so
 *  the page it lands on says it even when there is nothing left to do. */
export function DeleteAccountForm({ carried = null }: { carried?: DeletionDone | null }) {
  const [value, setValue] = useState("");
  const armed = value.trim() === "DELETE";

  return (
    <form action={deleteAccount} className="mt-4 flex flex-wrap items-center gap-2">
      {carried?.movedToTeam ? <input type="hidden" name="moved" value={carried.movedToTeam} /> : null}
      {carried?.cancelled ? <input type="hidden" name="cancelled" value="1" /> : null}
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
