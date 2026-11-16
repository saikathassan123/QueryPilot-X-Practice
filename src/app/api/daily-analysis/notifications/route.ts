import { NextRequest, NextResponse } from "next/server";
import { requireDailyAnalysisAccess } from "@/../daily_data_analysis_and_notification/api-helpers";
import { getSalesRepository } from "@/../daily_data_analysis_and_notification/database/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireDailyAnalysisAccess(request);
  if (denied) return denied;
  const rawLimit = Number(request.nextUrl.searchParams.get("limit") || 100);
  if (!Number.isInteger(rawLimit) || rawLimit < 1) return NextResponse.json({ error: "limit must be a positive integer." }, { status: 400 });
  return NextResponse.json({ notifications: getSalesRepository().listNotifications(rawLimit) }, { headers: { "Cache-Control": "no-store" } });
}
