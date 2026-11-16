import { NextRequest, NextResponse } from "next/server";
import { isUniqueConstraintError, parseSaleInput, requireDailyAnalysisAccess } from "@/../daily_data_analysis_and_notification/api-helpers";
import { getSalesRepository } from "@/../daily_data_analysis_and_notification/database/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireDailyAnalysisAccess(request);
  if (denied) return denied;
  const rawLimit = Number(request.nextUrl.searchParams.get("limit") || 100);
  if (!Number.isInteger(rawLimit) || rawLimit < 1) return NextResponse.json({ error: "limit must be a positive integer." }, { status: 400 });
  return NextResponse.json({ sales: getSalesRepository().listSales(rawLimit) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const denied = await requireDailyAnalysisAccess(request, true);
  if (denied) return denied;
  try {
    const sale = getSalesRepository().insertSale(parseSaleInput(await request.json()));
    return NextResponse.json({ sale }, { status: 201 });
  } catch (error) {
    if (isUniqueConstraintError(error)) return NextResponse.json({ error: "This order line already exists." }, { status: 409 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not insert sale." }, { status: 400 });
  }
}
