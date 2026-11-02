"use client";

import { useEffect, useState, type FormEvent } from "react";

import MembershipBadge from "@/components/membership-badge";

const PAID_TIERS = ["PREMIUM", "GOLD", "PLATINUM", "DIAMOND"] as const;
type PaidTier = (typeof PAID_TIERS)[number];

type MembershipResponse = {
  membership: { tier: string; expires_at: string | null };
  wallet: { address: string | null; verified: boolean };
  payment: {
    configured: boolean;
    mint: string | null;
    treasury: string | null;
    prices: Record<PaidTier, string>;
    durationDays: number;
  };
};

const tierNames: Record<PaidTier, string> = {
  PREMIUM: "Premium",
  GOLD: "Gold",
  PLATINUM: "Platinum",
  DIAMOND: "Diamond",
};

function getErrorMessage(payload: unknown) {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    switch (payload.error) {
      case "payment_pending":
        return "The payment is not finalized yet. Wait a little and submit the same signature again.";
      case "payment_not_valid":
        return "BHID could not verify this as the exact HBT payment for the selected tier.";
      case "payment_already_used":
        return "This transaction has already been used for a membership.";
      case "verified_wallet_required":
        return "Link and verify your Solana wallet in BHID Wallet Settings before paying.";
      case "too_many_payment_checks":
        return "Too many payment checks. Wait 15 minutes before submitting another transaction.";
    }
  }
  return "Unable to verify the payment. Please try again.";
}

export default function MembershipSettings() {
  const [data, setData] = useState<MembershipResponse | null>(null);
  const [tier, setTier] = useState<PaidTier>("PREMIUM");
  const [signature, setSignature] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/membership", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(getErrorMessage(payload));
        return payload as MembershipResponse;
      })
      .then((membershipData) => {
        if (!controller.signal.aborted) setData(membershipData);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load membership."
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/membership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, signature: signature.trim() }),
      });
      const payload: unknown = await response.json();

      if (response.status === 202) {
        throw new Error(getErrorMessage(payload));
      }
      if (!response.ok) {
        throw new Error(getErrorMessage(payload));
      }

      setMessage("Payment verified. Your membership has been updated.");
      setSignature("");
      const refreshed = await fetch("/api/membership", { cache: "no-store" });
      const refreshedData: unknown = await refreshed.json();
      if (!refreshed.ok) throw new Error(getErrorMessage(refreshedData));
      setData(refreshedData as MembershipResponse);
    } catch (paymentError) {
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : "Unable to verify the payment."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-zinc-400">Loading membership…</p>;
  }

  return (
    <div className="space-y-6">
      {data ? (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-lg font-semibold">Current membership</h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <MembershipBadge tier={data.membership.tier} />
            {data.membership.expires_at ? (
              <span className="text-sm text-zinc-400">
                Expires {new Date(data.membership.expires_at).toLocaleString()}
              </span>
            ) : (
              <span className="text-sm text-zinc-400">No expiry</span>
            )}
          </div>
          <p className="mt-4 text-sm text-zinc-400">
            Paid membership is separate from identity verification. It does
            not change your OIDC <code>verification_level</code>.
          </p>
        </section>
      ) : null}

      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="text-lg font-semibold">Pay with HBT</h2>
        {!data?.payment.configured ? (
          <div className="mt-3 rounded-lg border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-100">
            <p className="font-medium">
              HBT payments are not enabled on this BHID deployment yet.
            </p>
            <p className="mt-2 text-amber-200">
              The BHID deployment administrator must set these server-side
              environment variables and redeploy:
            </p>
            <ul className="mt-2 list-inside list-disc font-mono text-xs">
              <li>SOLANA_RPC_URL</li>
              <li>HBT_TOKEN_MINT</li>
              <li>HBT_TREASURY_ADDRESS</li>
            </ul>
            <p className="mt-2 text-xs text-amber-200">
              Never put RPC credentials in browser-visible variables. You can
              still manage your account and view your current membership while
              payments are disabled.
            </p>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-zinc-400">
              Payment is accepted only from your verified linked wallet to the
              BHID treasury. Send exactly the displayed amount using a
              checked HBT token transfer, then submit that transaction
              signature. Membership renews for 30 days from the current expiry
              or payment time, whichever is later.
            </p>
            <dl className="mt-4 space-y-2 break-all text-xs">
              <div><dt className="text-zinc-500">HBT mint</dt><dd className="font-mono">{data.payment.mint}</dd></div>
              <div><dt className="text-zinc-500">Treasury wallet</dt><dd className="font-mono">{data.payment.treasury}</dd></div>
              <div><dt className="text-zinc-500">Your verified wallet</dt><dd className="font-mono">{data.wallet.address ?? "Not linked"}</dd></div>
            </dl>
            {!data.wallet.verified ? (
              <p className="mt-4 text-sm text-amber-200">
                First link and verify a wallet in BHID Wallet Settings.
              </p>
            ) : null}
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {PAID_TIERS.map((paidTier) => (
                <button
                  aria-pressed={tier === paidTier}
                  className={`rounded-lg border p-4 text-left ${
                    tier === paidTier
                      ? "border-indigo-400 bg-indigo-950/60"
                      : "border-zinc-700 bg-zinc-950"
                  }`}
                  key={paidTier}
                  onClick={() => setTier(paidTier)}
                  type="button"
                >
                  <span className="block font-medium">{tierNames[paidTier]}</span>
                  <span className="mt-1 block text-sm text-zinc-400">
                    {data.payment.prices[paidTier]} HBT / 30 days
                  </span>
                </button>
              ))}
            </div>
            <form className="mt-5 space-y-3" onSubmit={(event) => void submitPayment(event)}>
              <label className="block text-sm">
                Solana transaction signature
                <input
                  autoComplete="off"
                  className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs"
                  onChange={(event) => setSignature(event.target.value)}
                  required
                  value={signature}
                />
              </label>
              {signature ? (
                <a
                  className="inline-block text-xs text-indigo-300 underline"
                  href={`https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=mainnet-beta`}
                  rel="noreferrer"
                  target="_blank"
                >
                  View transaction on Solana Explorer
                </a>
              ) : null}
              <button
                className="block rounded-md bg-white px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"
                disabled={
                  submitting ||
                  !data.wallet.verified ||
                  !data.payment.configured
                }
                type="submit"
              >
                {submitting ? "Verifying on Solana…" : "Verify payment"}
              </button>
            </form>
          </>
        )}
        {error ? <p className="mt-4 text-sm text-red-300" role="alert">{error}</p> : null}
        {message ? <p className="mt-4 text-sm text-emerald-300" role="status">{message}</p> : null}
      </section>
    </div>
  );
}
