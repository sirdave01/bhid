import { NextRequest, NextResponse } from "next/server";

import { getRequestSession } from "@/lib/account-session";
import pool from "@/lib/db";
import { isFounderAccount } from "@/lib/founder-access";
import { getHbtPaymentConfig } from "@/lib/solana-payments";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ organizationId: string; invoiceId: string }>;
  }
) {
  const { organizationId, invoiceId } = await context.params;
  if (!UUID_PATTERN.test(organizationId) || !UUID_PATTERN.test(invoiceId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json(
      { error: "authentication_required" },
      { status: 401 }
    );
  }

  try {
    const founder = isFounderAccount(session);
    const result = await pool.query<{
      invoice_number: string;
      amount_hbt: string;
      status: string;
      issued_at: Date | null;
      due_at: Date | null;
      organization_name: string;
    }>(
      `SELECT
         i.invoice_number,
         i.amount_hbt::text,
         CASE
           WHEN EXISTS (
             SELECT 1 FROM public.payments AS p
             WHERE p.invoice_id = i.id AND p.status = 'VERIFIED'
           ) THEN 'PAID'
           WHEN i.status = 'OPEN' AND i.due_at < now() THEN 'OVERDUE'
           ELSE i.status
         END AS status,
         i.issued_at,
         i.due_at,
         o.name AS organization_name
       FROM public.invoices AS i
       JOIN public.organizations AS o ON o.id = i.organization_id
       WHERE i.id = $1
         AND i.organization_id = $2
         AND (
           $3::boolean
           OR EXISTS (
             SELECT 1
             FROM public.organization_members AS m
             WHERE m.organization_id = i.organization_id
               AND m.user_id = $4
               AND m.role_key IN ('owner', 'admin')
           )
         )
       LIMIT 1`,
      [invoiceId, organizationId, founder, session.userId]
    );
    const invoice = result.rows[0];
    if (!invoice) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const lines = [
      `BHID Invoice ${invoice.invoice_number}`,
      `Organisation: ${invoice.organization_name}`,
      `Amount: ${invoice.amount_hbt} HBT`,
      `Status: ${invoice.status}`,
      `Issued: ${invoice.issued_at?.toISOString() ?? "Not issued"}`,
      `Due: ${invoice.due_at?.toISOString() ?? "Not applicable"}`,
    ];
    if (invoice.status === "OPEN" || invoice.status === "OVERDUE") {
      try {
        const paymentConfig = getHbtPaymentConfig();
        lines.push(
          `HBT token mint: ${paymentConfig.mint}`,
          `Treasury wallet owner: ${paymentConfig.treasury}`,
          "Pay the exact HBT amount from your verified linked wallet. Include the mint above."
        );
      } catch (error) {
        console.error("HBT invoice payment details are unavailable:", error);
        lines.push(
          "HBT payment details are not configured. Contact BHID support before sending funds."
        );
      }
    }
    lines.push("", "Payments are considered complete only after on-chain verification.");
    return new NextResponse(lines.join("\r\n"), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${invoice.invoice_number}.txt"`,
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("Organization invoice download failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
