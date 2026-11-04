"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function OrganizationInvoicePayment({
  organizationId,
  invoiceId,
}: {
  organizationId: string;
  invoiceId: string;
}) {
  const router = useRouter();
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submitPayment() {
    if (!signature.trim() || busy) {
      setError("Enter the HBT payment transaction signature.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/invoices/${invoiceId}/payments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signature: signature.trim() }),
        }
      );
      const payload: unknown = await response.json();

      if (!response.ok) {
        const code =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "";
        throw new Error(
          code === "payment_pending"
            ? "The transaction is not finalized yet. Wait and try again."
            : code === "verified_wallet_required"
              ? "Link and verify the payer wallet in BHID settings first."
              : code === "signature_already_used"
                ? "This Solana signature has already been applied."
                : code === "payment_configuration_unavailable"
                  ? "HBT payment settings are not configured."
                  : "Unable to verify this HBT payment."
        );
      }

      setSignature("");
      setMessage("Solana payment verified. The subscription is now active.");
      router.refresh();
    } catch (paymentError) {
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : "Unable to verify this HBT payment."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <label className="block text-xs text-zinc-400">
        Finalized HBT transaction signature
        <input
          autoComplete="off"
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-xs text-white"
          maxLength={100}
          onChange={(event) => setSignature(event.target.value)}
          value={signature}
        />
      </label>
      <button
        className="mt-2 rounded border border-indigo-700 px-2 py-1 text-xs text-indigo-200 hover:bg-indigo-950 disabled:opacity-50"
        disabled={busy || !signature.trim()}
        onClick={() => void submitPayment()}
        type="button"
      >
        {busy ? "Verifying on Solana…" : "Verify payment"}
      </button>
      {message && (
        <p className="mt-2 text-xs text-emerald-200" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
