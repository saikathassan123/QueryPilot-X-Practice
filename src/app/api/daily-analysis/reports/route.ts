import { NextRequest, NextResponse } from "next/server";
import { addDays, generateAutomaticReport, generateAutomaticReportForDate, generateHistoricalReport, type HistoricalRange } from "@/../daily_data_analysis_and_notification/analysis-service";
import { readDailyAnalysisSession } from "@/../daily_data_analysis_and_notification/api-helpers";
import { createSupabaseSalesRepository, type DatasetSelection } from "@/../daily_data_analysis_and_notification/database/supabase-sales-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await readDailyAnalysisSession(request);
  if ("response" in access) return access.response;
  const limit = Number(request.nextUrl.searchParams.get("limit") || 50);
  if (!Number.isInteger(limit) || limit < 1) return NextResponse.json({ error: "limit must be a positive integer." }, { status: 400 });
  return access.applyCookie(NextResponse.json({ reports: [] }, { headers: { "Cache-Control": "no-store" } }));
}

export async function POST(request: NextRequest) {
  const access = await readDailyAnalysisSession(request, true);
  if ("response" in access) return access.response;
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 });
  }
  try {
    const selection = body.dataset && typeof body.dataset === "object" ? body.dataset as DatasetSelection : { table: "daily_sales_orders" };
    if (typeof selection.table !== "string" || !selection.table) return NextResponse.json({ error: "Select a Supabase table." }, { status: 400 });
    const { repository, table, mapping, availableMetrics } = await createSupabaseSalesRepository(access.session, selection);
    if (body.kind === "historical") {
      const range = String(body.range);
      if (!["week", "month", "three-months", "year", "all", "custom"].includes(range)) return NextResponse.json({ error: "Invalid historical range." }, { status: 400 });
      let report = generateHistoricalReport(repository, range as HistoricalRange, typeof body.start === "string" ? body.start : undefined, typeof body.end === "string" ? body.end : undefined);
      if (range !== "custom" && report.current.totalProductLines === 0) {
        const latestDate = repository.getLatestSaleDate();
        if (latestDate && latestDate < report.periodStart) {
          const fallbackStart = range === "week" ? addDays(latestDate, -6) : range === "month" ? addDays(latestDate, -29) : report.periodStart;
          report = generateHistoricalReport(repository, "custom", fallbackStart, latestDate);
        }
      }
      return access.applyCookie(NextResponse.json({ report: { ...report, dataset: { table: table.name, mapping }, availableMetrics } }, { status: 201 }));
    }
    const comparisonDays = body.comparisonDays === undefined ? undefined : Number(body.comparisonDays);
    let report = generateAutomaticReport(repository, comparisonDays);
    if (report.current.totalProductLines === 0 && Object.values(report.current.statusDistribution).every(count => count === 0)) {
      const latestDate = repository.getLatestSaleDate();
      if (latestDate) {
        report = generateAutomaticReportForDate(repository, latestDate, comparisonDays);
      }
    }
    return access.applyCookie(NextResponse.json({ report: { ...report, dataset: { table: table.name, mapping }, availableMetrics } }, { status: 201 }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not generate the report." }, { status: 400 });
  }
}
