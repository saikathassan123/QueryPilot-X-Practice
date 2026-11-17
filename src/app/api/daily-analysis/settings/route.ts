import { NextRequest, NextResponse } from "next/server";
import { readDailyAnalysisSession } from "@/../daily_data_analysis_and_notification/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await readDailyAnalysisSession(request);
  if ("response" in access) return access.response;
  return NextResponse.json({ settings: { comparisonDays: 30, timezone: "Asia/Dhaka", dailyReportEnabled: false, notificationEnabled: false, scheduledTime: "00:15" } }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: NextRequest) {
  const access = await readDailyAnalysisSession(request, true);
  if ("response" in access) return access.response;
  return NextResponse.json({ error: "Settings are stored in browser localStorage and are not written to Supabase." }, { status: 405 });
}
