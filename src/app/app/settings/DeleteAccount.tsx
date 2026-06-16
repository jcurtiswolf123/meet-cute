"use client";

import { useState } from "react";
import { deleteAccount } from "@/lib/actions";

// Typed confirmation gate so the irreversible delete cannot be a stray click.
export function DeleteAccount() {
  const [confirm, setConfirm] = useState("");
  const armed = confirm.trim().toUpperCase() === "DELETE";
  return (
    <form action={deleteAccount} className="mt-4 space-y-3">
      <input
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder='Type DELETE to confirm'
        className="field"
        aria-label="Type DELETE to confirm"
      />
      <button
        type="submit"
        disabled={!armed}
        className="rounded-full bg-claret px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-40"
      >
        Permanently delete my account and data
      </button>
    </form>
  );
}
