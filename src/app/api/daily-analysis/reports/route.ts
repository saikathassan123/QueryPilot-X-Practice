import { NextRequest, NextResponse } from "next/server";
import { generateAutomaticReport, generateHistoricalReport, listReports, type HistoricalRange } from "@/../daily_data_analysis_and_notification/analysis-service";
import { requireDailyAnalysisAccess } from "@/../daily_data_analysis_and_notification/api-helpers";
import { getSalesRepository } from "@/../daily_data_analysis_and_notification/database/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireDailyAnalysisAccess(request);
  if (denied) return denied;
  const limit = Number(request.nextUrl.searchParams.get("limit") || 50);
  if (!Number.isInteger(limit) || limit < 1) return NextResponse.json({ error: "limit must be a positive integer." }, { status: 400 });
  return NextResponse.json({ reports: listReports(getSalesRepository(), limit) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const denied = await requireDailyAnalysisAccess(request, true);
  if (denied) return denied;
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 });
  }
  try {
    const repository = getSalesRepository();
    if (body.kind === "historical") {
      const range = String(body.range);
      if (!["week", "three-months", "year", "all"].includes(range)) return NextResponse.json({ error: "Invalid historical range." }, { status: 400 });
      return NextResponse.json({
        report: generateHistoricalReport(repository, range as HistoricalRange, typeof body.start === "string" ? body.start : undefined, typeof body.end === "string" ? body.end : undefined)
      }, { status: 201 });
    }
    return NextResponse.json({
      report: generateAutomaticReport(repository, body.comparisonDays === undefined ? undefined : Number(body.comparisonDays))
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not generate the report." }, { status: 400 });
  }
}
