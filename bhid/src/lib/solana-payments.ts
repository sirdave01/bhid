import "server-only";

import { isSolanaAddress } from "@/lib/solana-wallet";
import {
  PAID_MEMBERSHIP_PRICES,
  type MembershipTier,
} from "@/lib/membership";

const SPL_TOKEN_PROGRAMS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
]);

type RpcError = { code?: number; message?: string };

type RpcResponse<T> = {
  result?: T;
  error?: RpcError;
};

type ParsedTokenAccount = {
  value: {
    owner: string;
    data: {
      parsed?: {
        info?: {
          mint?: string;
          owner?: string;
        };
      };
    };
  } | null;
};

type ParsedInstruction = {
  program?: string;
  parsed?: {
    type?: string;
    info?: {
      mint?: string;
      source?: string;
      destination?: string;
      tokenAmount?: {
        amount?: string;
        decimals?: number;
      };
    };
  };
};

type ParsedTransaction = {
  blockTime?: number | null;
  meta?: { err?: unknown; innerInstructions?: { instructions: ParsedInstruction[] }[] } | null;
  transaction?: {
    signatures?: string[];
    message?: { instructions?: ParsedInstruction[] };
  };
};

export type HbtPaymentConfig = {
  rpcUrl: string;
  mint: string;
  treasury: string;
};

export class PaymentPendingError extends Error {}

export class InvalidPaymentError extends Error {}

export function getHbtPaymentConfig(): HbtPaymentConfig {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  const mint = process.env.HBT_TOKEN_MINT;
  const treasury = process.env.HBT_TREASURY_ADDRESS;

  if (!rpcUrl || !mint || !treasury) {
    throw new Error(
      "SOLANA_RPC_URL, HBT_TOKEN_MINT, and HBT_TREASURY_ADDRESS must be configured."
    );
  }

  let endpoint: URL;
  try {
    endpoint = new URL(rpcUrl);
  } catch {
    throw new Error("SOLANA_RPC_URL must be an absolute HTTPS URL.");
  }

  if (
    endpoint.protocol !== "https:" &&
    !(process.env.NODE_ENV !== "production" && endpoint.protocol === "http:")
  ) {
    throw new Error("SOLANA_RPC_URL must use HTTPS in production.");
  }

  if (!isSolanaAddress(mint) || !isSolanaAddress(treasury)) {
    throw new Error("HBT mint and treasury must be valid Solana addresses.");
  }

  return { rpcUrl: endpoint.toString(), mint, treasury };
}

async function callRpc<T>(
  config: HbtPaymentConfig,
  method: string,
  params: unknown[]
): Promise<T> {
  const response = await fetch(config.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "bhid-membership",
      method,
      params,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`Solana RPC request failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as RpcResponse<T>;
  if (payload.error) {
    throw new Error(
      `Solana RPC ${method} failed: ${payload.error.message ?? payload.error.code ?? "unknown error"}`
    );
  }
  if (!("result" in payload)) {
    throw new Error(`Solana RPC ${method} returned no result.`);
  }

  return payload.result as T;
}

async function getTokenAccountOwner(
  config: HbtPaymentConfig,
  address: string
) {
  const result = await callRpc<ParsedTokenAccount>(
    config,
    "getAccountInfo",
    [address, { encoding: "jsonParsed", commitment: "finalized" }]
  );
  const account = result.value;
  const info = account?.data.parsed?.info;

  if (
    !account ||
    !SPL_TOKEN_PROGRAMS.has(account.owner) ||
    !info?.mint ||
    !info.owner
  ) {
    throw new InvalidPaymentError("Payment does not use a valid HBT token account.");
  }

  return { mint: info.mint, owner: info.owner };
}

export async function verifyHbtPayment(
  config: HbtPaymentConfig,
  signature: string,
  linkedWallet: string,
  tier: Exclude<MembershipTier, "BASIC">
) {
  const statuses = await callRpc<{
    value: { confirmationStatus?: string | null; err?: unknown }[];
  }>(config, "getSignatureStatuses", [
    [signature],
    { searchTransactionHistory: true },
  ]);
  const signatureStatus = statuses.value[0];

  if (signatureStatus?.err) {
    throw new InvalidPaymentError("The Solana transaction failed.");
  }
  if (!signatureStatus || !signatureStatus.confirmationStatus) {
    throw new PaymentPendingError("Payment has not appeared on Solana yet.");
  }
  if (signatureStatus.confirmationStatus !== "finalized") {
    throw new PaymentPendingError(
      "Payment is not finalized yet. Wait for finality and retry."
    );
  }

  const transaction = await callRpc<ParsedTransaction | null>(
    config,
    "getTransaction",
    [
      signature,
      {
        commitment: "finalized",
        encoding: "jsonParsed",
        maxSupportedTransactionVersion: 0,
      },
    ]
  );

  if (!transaction) {
    throw new PaymentPendingError(
      "The finalized transaction is not available from the RPC provider yet."
    );
  }
  if (
    transaction.transaction?.signatures?.[0] !== signature ||
    !transaction.meta ||
    transaction.meta.err ||
    typeof transaction.blockTime !== "number"
  ) {
    throw new InvalidPaymentError("The transaction is invalid or unsuccessful.");
  }

  const instructions = [
    ...(transaction.transaction.message?.instructions ?? []),
    ...(transaction.meta.innerInstructions ?? []).flatMap(
      (inner) => inner.instructions
    ),
  ];
  const requestedAmount = PAID_MEMBERSHIP_PRICES[tier];
  const paymentTransfers = instructions.filter((instruction) => {
    const info = instruction.parsed?.info;
    const amount = info?.tokenAmount?.amount;
    const decimals = info?.tokenAmount?.decimals;

    return (
      SPL_TOKEN_PROGRAMS.has(
        instruction.program === "spl-token"
          ? "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
          : instruction.program === "spl-token-2022"
            ? "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
            : ""
      ) &&
      instruction.parsed?.type === "transferChecked" &&
      info?.mint === config.mint &&
      typeof info.source === "string" &&
      typeof info.destination === "string" &&
      typeof amount === "string" &&
      /^\d+$/.test(amount) &&
      Number.isInteger(decimals) &&
      decimals! >= 0 &&
      decimals! <= 18 &&
      BigInt(amount) === requestedAmount * BigInt(10) ** BigInt(decimals!)
    );
  });

  if (paymentTransfers.length !== 1) {
    throw new InvalidPaymentError(
      `Transaction must contain exactly one ${tier} payment in HBT.`
    );
  }

  const transfer = paymentTransfers[0].parsed!.info!;
  const [source, destination] = await Promise.all([
    getTokenAccountOwner(config, transfer.source!),
    getTokenAccountOwner(config, transfer.destination!),
  ]);

  if (
    source.owner !== linkedWallet ||
    destination.owner !== config.treasury ||
    source.mint !== config.mint ||
    destination.mint !== config.mint
  ) {
    throw new InvalidPaymentError(
      "Payment must be HBT from your verified linked wallet to the BHID treasury."
    );
  }

  return {
    paidAt: new Date(transaction.blockTime * 1000),
    amountBaseUnits: (
      requestedAmount *
      BigInt(10) ** BigInt(transfer.tokenAmount!.decimals!)
    ).toString(),
  };
}
