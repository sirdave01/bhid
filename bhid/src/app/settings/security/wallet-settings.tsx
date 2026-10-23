"use client";

import { useEffect, useState } from "react";

type WalletPublicKey = {
  toBase58?: () => string;
  toString: () => string;
};

type WalletProvider = {
  connect: () => Promise<{ publicKey?: WalletPublicKey } | void>;
  publicKey?: WalletPublicKey;
  signMessage?: (
    message: Uint8Array,
    display?: "utf8"
  ) => Promise<Uint8Array | { signature: Uint8Array }>;
};

type WalletOption = {
  name: string;
  provider: WalletProvider;
};

type LinkedWallet = {
  address: string | null;
  verifiedAt: string | null;
};

declare global {
  interface Window {
    phantom?: { solana?: WalletProvider };
    bitkeep?: { solana?: WalletProvider };
    bitget?: { solana?: WalletProvider };
    solflare?: WalletProvider;
    backpack?: WalletProvider;
    solana?: WalletProvider;
  }
}

function responseMessage(value: unknown, fallback: string): string {
  return typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
    ? value.message
    : fallback;
}

async function postJson(
  url: string,
  body: Record<string, string>,
  fallback: string
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    throw new Error(responseMessage(payload, fallback));
  }

  return payload;
}

function isWalletChallenge(
  value: unknown
): value is { data: { challengeId: string; message: string } } {
  return (
    typeof value === "object" &&
    value !== null &&
    "data" in value &&
    typeof value.data === "object" &&
    value.data !== null &&
    "challengeId" in value.data &&
    typeof value.data.challengeId === "string" &&
    "message" in value.data &&
    typeof value.data.message === "string"
  );
}

function walletOptions(): WalletOption[] {
  const options: WalletOption[] = [];
  const add = (name: string, provider: WalletProvider | undefined) => {
    if (
      provider &&
      typeof provider.connect === "function" &&
      typeof provider.signMessage === "function" &&
      !options.some((option) => option.provider === provider)
    ) {
      options.push({ name, provider });
    }
  };

  add("Phantom", window.phantom?.solana);
  add("Bitget Wallet", window.bitkeep?.solana);
  add("Bitget Wallet", window.bitget?.solana);
  add("Solflare", window.solflare);
  add("Backpack", window.backpack);
  add("Solana wallet", window.solana);

  return options;
}

function readWalletAddress(publicKey: WalletPublicKey | undefined): string {
  if (!publicKey) {
    throw new Error("Your wallet did not provide a public address.");
  }

  return publicKey.toBase58?.() ?? publicKey.toString();
}

function encodeSignature(signature: Uint8Array): string {
  if (signature.length !== 64) {
    throw new Error("Your wallet returned an invalid signature.");
  }

  return window.btoa(
    Array.from(signature, (byte) => String.fromCharCode(byte)).join("")
  );
}

export default function WalletSettings() {
  const [wallet, setWallet] = useState<LinkedWallet>({
    address: null,
    verifiedAt: null,
  });
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [editingWallet, setEditingWallet] = useState(false);
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
    const walletDetection = window.setTimeout(
      () => setWallets(walletOptions()),
      0
    );

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

    return () => {
      controller.abort();
      window.clearTimeout(walletDetection);
    };
  }, []);

  function openInPhantom() {
    const phantomUrl = new URL(
      `https://phantom.com/ul/browse/${encodeURIComponent(window.location.href)}`
    );
    phantomUrl.searchParams.set("ref", window.location.origin);
    window.location.assign(phantomUrl);
  }

  async function connectAndLink(option: WalletOption) {
    setBusy(true);
    setMessage("");

    try {
      const connected = await option.provider.connect();
      const address = readWalletAddress(
        connected?.publicKey ?? option.provider.publicKey
      );
      const challengePayload = await postJson(
        "/api/account/wallet/challenge",
        { address },
        "Unable to start wallet verification."
      );

      if (!isWalletChallenge(challengePayload)) {
        throw new Error("The wallet verification challenge was invalid.");
      }

      const signMessage = option.provider.signMessage;
      if (!signMessage) {
        throw new Error(
          "This wallet does not support message signing. Try another Solana wallet."
        );
      }

      const result = await signMessage(
        new TextEncoder().encode(challengePayload.data.message),
        "utf8"
      );
      const signature = result instanceof Uint8Array ? result : result.signature;
      const verifyPayload = await postJson(
        "/api/account/wallet/verify",
        {
          challengeId: challengePayload.data.challengeId,
          signature: encodeSignature(signature),
        },
        "Unable to verify wallet ownership."
      );

      if (
        typeof verifyPayload !== "object" ||
        verifyPayload === null ||
        !("success" in verifyPayload) ||
        verifyPayload.success !== true
      ) {
        throw new Error(
          responseMessage(verifyPayload, "Unable to verify wallet ownership.")
        );
      }

      setMessage(
        responseMessage(verifyPayload, "Solana wallet ownership verified")
      );
      setWallet(await loadWallet());
      setEditingWallet(false);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to connect and verify this wallet."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-zinc-700 bg-zinc-900 p-6 text-white shadow-sm">
      <h2 className="text-xl font-semibold tracking-tight">Solana wallet</h2>
      <p className="mt-1 text-sm text-zinc-300">
        Connect a compatible wallet and approve a one-time BHID message inside
        the wallet. Your signature is verified without asking you to copy it.
        The address is private profile data and is not sent to OAuth clients.
      </p>
      {wallet.address && !editingWallet ? (
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
          <button
            className="mt-4 rounded-lg border border-zinc-600 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            onClick={() => setEditingWallet(true)}
            type="button"
          >
            Change wallet
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {wallets.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {wallets.map((option) => (
                <button
                  className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"
                  disabled={busy}
                  key={option.name}
                  onClick={() => void connectAndLink(option)}
                  type="button"
                >
                  {busy ? "Waiting for wallet…" : `Connect ${option.name}`}
                </button>
              ))}
              {wallet.address && (
                <button
                  className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                  onClick={() => setEditingWallet(false)}
                  type="button"
                >
                  Cancel
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-4 text-sm text-zinc-300">
              <p>
                No compatible wallet was detected. For Phantom, open this page
                in the Phantom app. For Bitget Wallet or another Solana wallet,
                open BHID in that wallet&apos;s DApp browser.
              </p>
              <button
                className="mt-3 inline-block font-medium text-white underline"
                onClick={openInPhantom}
                type="button"
              >
                Open BHID in Phantom
              </button>
            </div>
          )}
        </div>
      )}
      {message && (
        <p aria-live="polite" className="mt-4 text-sm text-zinc-200" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
