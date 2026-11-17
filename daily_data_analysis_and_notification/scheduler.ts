import type Database from "better-sqlite3";
import { addDays, comparisonDays, generateAutomaticReportForDate } from "./analysis-service";
import { readAnalysisSettings } from "./settings";
import { saveAnalysisReportPdf, readAnalysisReportPdf } from "./pdf/report-pdf";
import type { AnalysisReport, SalesRepository } from "./types";

const CURSOR_KEY = "lastSuccessfulScheduledDate";
const LEASE_MINUTES = 15;

export type SchedulerRunOptions = {
  date?: string;
  dryRun?: boolean;
  now?: Date;
};

export type SchedulerResult = {
  status: "skipped" | "generated" | "retried" | "dry-run";
  reportingDates: string[];
  reports: AnalysisReport[];
};

function dateInTimezone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value).reduce<Record<string, string>>((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function generationKey(date: string, days: number) {
  return ["automatic", date, date, date, days, addDays(date, -days), addDays(date, -1)].join("|");
}

function isValidPdf(bytes: Buffer | null) {
  return Boolean(bytes && bytes.byteLength > 4 && bytes.subarray(0, 5).toString("ascii") === "%PDF-");
}

function claim(database: Database.Database, reportingDate: string, key: string) {
  const now = new Date();
  const nowText = now.toISOString();
  const lease = new Date(now.getTime() + LEASE_MINUTES * 60_000).toISOString();
  const claimTransaction = database.transaction(() => {
    const existing = database.prepare("SELECT status, lease_expires_at AS leaseExpiresAt FROM daily_report_executions WHERE execution_key = ?").get(key) as { status: string; leaseExpiresAt: string | null } | undefined;
    if (existing?.status === "running" && existing.leaseExpiresAt && existing.leaseExpiresAt > nowText) return "in-progress" as const;
    database.prepare(`
      INSERT INTO daily_report_executions
        (execution_key, reporting_date, generation_key, status, attempt_count, started_at, lease_expires_at, error_message)
      VALUES (?, ?, ?, 'running', 1, ?, ?, NULL)
      ON CONFLICT (execution_key) DO UPDATE SET
        status = 'running',
        attempt_count = daily_report_executions.attempt_count + 1,
        started_at = excluded.started_at,
        lease_expires_at = excluded.lease_expires_at,
        error_message = NULL
    `).run(key, reportingDate, key, nowText, lease);
    return "claimed" as const;
  }).immediate;
  return claimTransaction();
}

function finish(database: Database.Database, key: string, status: "succeeded" | "failed", errorMessage?: string) {
  database.prepare(`
    UPDATE daily_report_executions
    SET status = ?, completed_at = ?, lease_expires_at = NULL, error_message = ?
    WHERE execution_key = ?
  `).run(status, new Date().toISOString(), errorMessage || null, key);
}

function hasUsablePdf(report: AnalysisReport) {
  return readAnalysisReportPdf(report).then(isValidPdf);
}

async function processDate(repository: SalesRepository, database: Database.Database, date: string, days: number, dryRun: boolean): Promise<"generated" | "retried" | "skipped" | "dry-run"> {
  const key = generationKey(date, days);
  if (dryRun) {
    generateAutomaticReportForDate(repository, date, days, false);
    return "dry-run";
  }
  const claimResult = claim(database, date, key);
  if (claimResult === "in-progress") return "skipped";
  let report: AnalysisReport | null = null;
  try {
    report = generateAutomaticReportForDate(repository, date, days);
    const hadPdf = report.pdfStatus === "generated" && await hasUsablePdf(report);
    if (hadPdf) {
      finish(database, key, "succeeded");
      return "skipped";
    }
    const stored = await saveAnalysisReportPdf(report);
    const pdf = await readAnalysisReportPdf(report);
    if (!isValidPdf(pdf)) throw new Error("PDF verification failed: the generated file is not a valid PDF.");
    repository.updateAnalysisReportPdf(report.id as number, {
      status: "generated",
      filename: stored.filename,
      generatedAt: new Date().toISOString(),
      sizeBytes: stored.sizeBytes
    });
    finish(database, key, "succeeded");
    return report.pdfStatus === "failed" ? "retried" : "generated";
  } catch (error) {
    if (report?.id) {
      repository.updateAnalysisReportPdf(report.id, {
        status: "failed",
        error: error instanceof Error ? error.message : "PDF generation failed."
      });
    }
    finish(database, key, "failed", error instanceof Error ? error.message : "Report generation failed.");
    throw error;
  }
}

export async function runDailyReport(repository: SalesRepository, database: Database.Database, options: SchedulerRunOptions = {}): Promise<SchedulerResult> {
  const settings = readAnalysisSettings(repository);
  const now = options.now || new Date();
  const today = dateInTimezone(now, settings.timezone);
  const yesterday = addDays(today, -1);
  const requestedDate = options.date;
  if (requestedDate !== undefined && (!validDate(requestedDate) || requestedDate > yesterday)) {
    throw new Error(`The reporting date must be a valid past date no later than ${yesterday}.`);
  }
  const days = comparisonDays(settings.comparisonDays);
  if (options.dryRun) {
    const date = requestedDate || yesterday;
    await processDate(repository, database, date, days, true);
    return { status: "dry-run", reportingDates: [date], reports: [] };
  }
  if (requestedDate) {
    const result = await processDate(repository, database, requestedDate, days, false);
    const report = repository.getAnalysisReportByGenerationKey(generationKey(requestedDate, days));
    return { status: result === "skipped" ? "skipped" : result, reportingDates: [requestedDate], reports: report ? [report] : [] };
  }
  if (!settings.dailyReportEnabled) return { status: "skipped", reportingDates: [], reports: [] };

  const cursor = repository.getAnalysisPreference(CURSOR_KEY);
  const firstRun = cursor === null;
  const dates: string[] = [];
  if (firstRun) dates.push(yesterday);
  else for (let date = addDays(cursor, 1); date <= yesterday; date = addDays(date, 1)) dates.push(date);
  const reports: AnalysisReport[] = [];
  let status: SchedulerResult["status"] = "skipped";
  for (const date of dates) {
    const result = await processDate(repository, database, date, days, false);
    if (result !== "skipped") status = result;
    const report = repository.getAnalysisReportByGenerationKey(generationKey(date, days));
    if (report) reports.push(report);
    if (result !== "skipped" || cursor === null || repository.getAnalysisReportByGenerationKey(generationKey(date, days))) {
      repository.setAnalysisPreference(CURSOR_KEY, date);
    }
  }
  return { status, reportingDates: dates, reports };
}

export { addDays, dateInTimezone, generationKey, validDate };
