function option(name: string) {
  const prefix = `--${name}=`;
  const argument = process.argv.find(value => value.startsWith(prefix));
  return argument?.slice(prefix.length);
}

async function main() {
  Object.assign(process.env, { NODE_ENV: "development" });
  const { getLocalDatabase, getLocalDatabaseReadOnly } = await import("../database/sqlite-client");
  const { LocalSqliteSalesRepository } = await import("../database/local-sqlite-sales-repository");
  const { addDays, runDailyReport } = await import("../scheduler");
  const { readAnalysisSettings } = await import("../settings");
  const path = await import("node:path");
  const unknown = process.argv.slice(2).filter(value => !value.startsWith("--date=") && value !== "--dry-run");
  if (unknown.length) throw new Error(`Unknown argument: ${unknown[0]}`);
  const date = option("date");
  const dryRun = process.argv.includes("--dry-run");
  const database = dryRun ? getLocalDatabaseReadOnly() : getLocalDatabase();
  const repository = new LocalSqliteSalesRepository(database);
  const result = await runDailyReport(repository, database, {
    date,
    dryRun
  });
  const settings = readAnalysisSettings(repository);
  const report = result.reports[0];
  const reportingDate = result.reportingDates[0];
  console.log(JSON.stringify({
    mode: date ? "manual" : "scheduled",
    reportingDates: result.reportingDates,
    timezone: settings.timezone,
    comparisonPeriod: report?.comparisonStart && report.comparisonEnd
      ? `${report.comparisonStart} to ${report.comparisonEnd}`
      : reportingDate
        ? `${addDays(reportingDate, -settings.comparisonDays)} to ${addDays(reportingDate, -1)}`
        : null,
    reports: result.reports.map(report => ({
      id: report.id,
      reportingDate: report.reportingDate,
      pdfFilename: report.pdfFilename,
      pdfPath: report.pdfFilename ? path.join(process.env.QUERYPILOT_REPORT_DIRECTORY || path.join(process.cwd(), "Generated PDFs"), report.pdfFilename) : null,
      pdfSizeBytes: report.pdfSizeBytes
    })),
    status: result.status
  }, null, 2));
  if (dryRun) database.close();
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

export {};
