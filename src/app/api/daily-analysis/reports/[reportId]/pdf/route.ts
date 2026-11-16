import { NextRequest, NextResponse } from "next/server";
import { requireDailyAnalysisAccess } from "@/../daily_data_analysis_and_notification/api-helpers";
import { readAnalysisReportPdf, saveAnalysisReportPdf } from "@/../daily_data_analysis_and_notification/pdf/report-pdf";
import { getSalesRepository } from "@/../daily_data_analysis_and_notification/database/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ reportId: string }> };

function parseReportId(value: string) {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

async function getReport(request: NextRequest, context: RouteContext) {
  const denied = await requireDailyAnalysisAccess(request);
  if (denied) return { response: denied };
  const { reportId } = await context.params;
  const id = parseReportId(reportId);
  if (id === null) return { response: NextResponse.json({ error: "reportId must be a positive integer." }, { status: 400 }) };
  const report = getSalesRepository().getAnalysisReport(id);
  if (!report) return { response: NextResponse.json({ error: "Report not found." }, { status: 404 }) };
  return { id, report };
}

export async function POST(request: NextRequest, context: RouteContext) {
  const access = await getReport(request, context);
  if ("response" in access) return access.response;
  const denied = await requireDailyAnalysisAccess(request, true);
  if (denied) return denied;
  try {
    const stored = await saveAnalysisReportPdf(access.report);
    return NextResponse.json({
      reportId: access.id,
      filename: stored.filename,
      downloadUrl: `/api/daily-analysis/reports/${access.id}/pdf`
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not generate the PDF." }, { status: 500 });
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  const access = await getReport(request, context);
  if ("response" in access) return access.response;
  try {
    const pdf = await readAnalysisReportPdf(access.report);
    if (!pdf) return NextResponse.json({ error: "PDF has not been generated for this report." }, { status: 404 });
    const filename = `querypilot-x-report-${access.id}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not download the PDF." }, { status: 500 });
  }
}
