import { NextRequest, NextResponse } from "next/server";
import { parseAnalysisSettings, readAnalysisSettings, saveAnalysisSettings } from "@/../daily_data_analysis_and_notification/settings";
import { requireDailyAnalysisAccess } from "@/../daily_data_analysis_and_notification/api-helpers";
import { getSalesRepository } from "@/../daily_data_analysis_and_notification/database/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireDailyAnalysisAccess(request);
  if (denied) return denied;
  return NextResponse.json({ settings: readAnalysisSettings(getSalesRepository()) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: NextRequest) {
  const denied = await requireDailyAnalysisAccess(request, true);
  if (denied) return denied;
  try {
    const repository = getSalesRepository();
    const settings = parseAnalysisSettings(await request.json(), readAnalysisSettings(repository));
    saveAnalysisSettings(repository, settings);
    return NextResponse.json({ settings }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save settings." }, { status: 400 });
  }
}
