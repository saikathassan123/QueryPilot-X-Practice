import { NextRequest, NextResponse } from "next/server";
import { readDailyAnalysisSession } from "@/../daily_data_analysis_and_notification/api-helpers";
import { createSupabaseSalesRepository } from "@/../daily_data_analysis_and_notification/database/supabase-sales-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await readDailyAnalysisSession(request);
  if ("response" in access) return access.response;
  const rawLimit = Number(request.nextUrl.searchParams.get("limit") || 100);
  if (!Number.isInteger(rawLimit) || rawLimit < 1) return NextResponse.json({ error: "limit must be a positive integer." }, { status: 400 });
  try {
    const { repository } = await createSupabaseSalesRepository(access.session, { table: request.nextUrl.searchParams.get("table") || "daily_sales_orders" });
    return access.applyCookie(NextResponse.json({ notifications: repository.listNotifications(rawLimit) }, { headers: { "Cache-Control": "no-store" } }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load notifications." }, { status: 400 });
  }
}
