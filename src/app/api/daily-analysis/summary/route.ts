import { NextRequest, NextResponse } from "next/server";
import { readDailyAnalysisSession } from "@/../daily_data_analysis_and_notification/api-helpers";
import { createSupabaseSalesRepository } from "@/../daily_data_analysis_and_notification/database/supabase-sales-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dateValue(value: string | null, fallback: string) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))) return value;
  return fallback;
}

export async function GET(request: NextRequest) {
  const access = await readDailyAnalysisSession(request);
  if ("response" in access) return access.response;
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const startDate = new Date(today);
  startDate.setUTCDate(startDate.getUTCDate() - 6);
  const start = dateValue(request.nextUrl.searchParams.get("start"), startDate.toISOString().slice(0, 10));
  const periodEnd = dateValue(request.nextUrl.searchParams.get("end"), end);
  if (start > periodEnd) return NextResponse.json({ error: "start must not be after end." }, { status: 400 });
  try {
    const { repository } = await createSupabaseSalesRepository(access.session, { table: request.nextUrl.searchParams.get("table") || "daily_sales_orders" });
    const analysis = repository.analyzePeriod(start, periodEnd);
    return access.applyCookie(NextResponse.json({ analysis }, { headers: { "Cache-Control": "no-store" } }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not analyze period." }, { status: 400 });
  }
}
