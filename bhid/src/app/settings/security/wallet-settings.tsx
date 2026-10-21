"use client";

import { useEffect, useState } from "react";

type LinkedWallet = {
  address: string | null;
  verifiedAt: string | null;
};

type WalletChallenge = {
  challengeId: string;
  message: string;
};

export default function WalletSettings() {
  const [wallet, setWallet] = useState<LinkedWallet>({
    address: null,
    verifiedAt: null,
  });
  const [address, setAddress] = useState("");
  const [challenge, setChallenge] = useState<WalletChallenge | null>(null);
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function loadWallet(signal?: AbortSignal): Promise<LinkedWallet> {
    const response = await fetch("/api/account/profile", {
      cache: "no-store",
      signal,
    });
    const payload: unknown = await response.json();

    if (
      !response.ok ||
      typeof payload !== "object" ||
      payload === null ||
      !("data" in payload) ||
      typeof payload.data !== "object" ||
      payload.data === null
    ) {
      throw new Error("Unable to load your linked wallet.");
    }

    const data = payload.data;
    return {
      address:
        "walletAddress" in data && typeof data.walletAddress === "string"
          ? data.walletAddress
          : null,
      verifiedAt:
        "walletVerifiedAt" in data && typeof data.walletVerifiedAt === "string"
          ? data.walletVerifiedAt
          : null,
    };
  }

  useEffect(() => {
    const controller = new AbortController();

    void loadWallet(controller.signal)
      .then(setWallet)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Unable to load your linked wallet."
          );
        }
      });

    return () => controller.abort();
  }, []);

  async function createChallenge() {
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/account/wallet/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const payload: unknown = await response.json();

      if (
        !response.ok ||
        typeof payload !== "object" ||
        payload === null ||
        !("data" in payload) ||
        typeof payload.data !== "object" ||
        payload.data === null ||
        !("challengeId" in payload.data) ||
        typeof payload.data.challengeId !== "string" ||
        !("message" in payload.data) ||
        typeof payload.data.message !== "string"
      ) {
        const errorMessage =
          typeof payload === "object" &&
          payload !== null &&
          "message" in payload &&
          typeof payload.message === "string"
            ? payload.message
            : "Unable to start wallet verification.";
        throw new Error(errorMessage);
      }

      setChallenge({
        challengeId: payload.data.challengeId,
        message: payload.data.message,
      });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to start wallet verification."
      );
    } finally {
      setBusy(false);
    }
  }

  async function verifyWallet() {
    if (!challenge) {
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/account/wallet/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          signature,
        }),
      });
      const payload: unknown = await response.json();

      if (
        !response.ok ||
        typeof payload !== "object" ||
        payload === null ||
        !("message" in payload) ||
        typeof payload.message !== "string"
      ) {
        const errorMessage =
          typeof payload === "object" &&
          payload !== null &&
          "message" in payload &&
          typeof payload.message === "string"
            ? payload.message
            : "Unable to verify wallet ownership.";
        throw new Error(errorMessage);
      }

      setMessage(payload.message);
      setChallenge(null);
      setSignature("");
      setAddress("");
      setWallet(await loadWallet());
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to verify wallet ownership."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-zinc-700 bg-zinc-900 p-6 text-white shadow-sm">
      <h2 className="text-xl font-semibold tracking-tight">Solana wallet</h2>
      <p className="mt-1 text-sm text-zinc-300">
        A wallet is linked only after its owner signs a one-time BHID message.
        The address is private profile data and is not sent to OAuth clients.
      </p>
      {wallet.address ? (
        <div className="mt-5 rounded-lg border border-zinc-700 bg-zinc-950 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-400">
            Verified wallet
          </p>
          <p className="mt-2 break-all font-mono text-sm">{wallet.address}</p>
          {wallet.verifiedAt && (
            <p className="mt-2 text-xs text-zinc-400">
              Verified {new Date(wallet.verifiedAt).toLocaleString()}
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="mt-5">
            <label className="block text-sm font-medium" htmlFor="wallet-address">
              Solana address
            </label>
            <input
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-white"
              id="wallet-address"
              onChange={(event) => setAddress(event.target.value.trim())}
              value={address}
            />
          </div>
          {!challenge ? (
            <button
              className="mt-4 rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"
              disabled={busy || !address}
              onClick={() => void createChallenge()}
              type="button"
            >
              Create signed-message challenge
            </button>
          ) : (
            <div className="mt-5 space-y-4">
              <p className="text-sm text-zinc-200">
                Sign this exact message with your Solana wallet and paste the
                resulting base58 signature. The challenge expires in five
                minutes.
              </p>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-zinc-950 p-3 text-xs text-zinc-200">
                {challenge.message}
              </pre>
              <label className="block text-sm font-medium" htmlFor="wallet-signature">
                Wallet signature (base58)
              </label>
              <textarea
                className="min-h-20 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-white"
                id="wallet-signature"
                onChange={(event) => setSignature(event.target.value.trim())}
                value={signature}
              />
              <button
                className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"
                disabled={busy || !signature}
                onClick={() => void verifyWallet()}
                type="button"
              >
                Verify and link wallet
              </button>
            </div>
          )}
        </>
      )}
      {message && (
        <p aria-live="polite" className="mt-4 text-sm text-zinc-200" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
