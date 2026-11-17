import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { readdirSync } from "node:fs";
import { LocalSqliteSalesRepository } from "../database/local-sqlite-sales-repository";
import { generateAutomaticReportForDate } from "../analysis-service";
import { runDailyReport, addDays, dateInTimezone, validDate } from "../scheduler";
import { readAnalysisSettings, saveAnalysisSettings } from "../settings";

const root = path.resolve(process.cwd());
const migrationDirectory = path.join(root, "daily_data_analysis_and_notification", "database", "migrations");

function createFixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "querypilot-daily-report-"));
  const database = new Database(path.join(directory, "test.sqlite"));
  database.pragma("journal_mode = WAL");
  database.pragma("busy_timeout = 5000");
  database.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  for (const name of readdirSync(migrationDirectory).filter(value => /^\d+_.+\.sql$/.test(value)).sort()) {
    database.exec(readFileSync(path.join(migrationDirectory, name), "utf8"));
    database.prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)").run(Number(name.split("_", 1)[0]), name);
  }
  const reports = path.join(directory, "reports");
  process.env.QUERYPILOT_REPORT_DIRECTORY = reports;
  const repository = new LocalSqliteSalesRepository(database);
  saveAnalysisSettings(repository, {
    comparisonDays: 30,
    timezone: "Asia/Dhaka",
    dailyReportEnabled: true,
    notificationEnabled: false,
    scheduledTime: "00:15"
  });
  return { directory, database, repository, reports };
}

function cleanup(fixture: ReturnType<typeof createFixture>) {
  fixture.database.close();
  delete process.env.QUERYPILOT_REPORT_DIRECTORY;
  rmSync(fixture.directory, { recursive: true, force: true });
}

function addSale(repository: LocalSqliteSalesRepository, date: string) {
  repository.insertSale({
    orderId: `order-${date}`,
    lineNumber: 1,
    orderDate: date,
    customerName: "Test customer",
    customerEmail: "test@example.com",
    customerPhone: "000",
    productName: "Test product",
    category: "Test",
    region: "Dhaka",
    quantity: 1,
    unitPrice: 100,
    unitCost: 40,
    status: "Completed"
  });
}

test("previous day uses Asia/Dhaka", () => {
  assert.equal(dateInTimezone(new Date("2026-11-16T18:00:00.000Z"), "Asia/Dhaka"), "2026-11-17");
  assert.equal(addDays("2026-11-17", -1), "2026-11-16");
});

test("month and year boundaries are calendar-safe", () => {
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("leap-year calculation is correct", () => {
  assert.equal(addDays("2024-03-01", -1), "2024-02-29");
  assert.equal(addDays("2025-03-01", -1), "2025-02-28");
});

test("date validation rejects malformed and future dates", () => {
  assert.equal(validDate("2026-02-29"), false);
  assert.equal(validDate("2024-02-29"), true);
});

test("saved comparison preference is used", () => {
  const fixture = createFixture();
  try {
    fixture.repository.setAnalysisPreference("comparisonDays", "7");
    const report = generateAutomaticReportForDate(fixture.repository, "2026-11-15");
    assert.equal(report.comparisonDays, 7);
    assert.equal(report.comparisonStart, "2026-11-08");
  } finally { cleanup(fixture); }
});

test("dry run does not persist report or PDF", async () => {
  const fixture = createFixture();
  try {
    const result = await runDailyReport(fixture.repository, fixture.database, { date: "2026-11-15", dryRun: true });
    assert.equal(result.status, "dry-run");
    assert.equal(fixture.repository.listAnalysisReports().length, 0);
  } finally { cleanup(fixture); }
});

test("manual report creates history and a verified PDF", async () => {
  const fixture = createFixture();
  try {
    addSale(fixture.repository, "2026-11-15");
    const result = await runDailyReport(fixture.repository, fixture.database, { date: "2026-11-15" });
    assert.equal(result.status, "generated");
    assert.equal(result.reports[0]?.pdfStatus, "generated");
    assert.equal(fixture.repository.listAnalysisReports().length, 1);
  } finally { cleanup(fixture); }
});

test("repeated manual execution is idempotent", async () => {
  const fixture = createFixture();
  try {
    await runDailyReport(fixture.repository, fixture.database, { date: "2026-11-15" });
    const second = await runDailyReport(fixture.repository, fixture.database, { date: "2026-11-15" });
    assert.equal(second.status, "skipped");
    assert.equal(fixture.repository.listAnalysisReports().length, 1);
  } finally { cleanup(fixture); }
});

test("zero-sales date creates a valid report", async () => {
  const fixture = createFixture();
  try {
    const result = await runDailyReport(fixture.repository, fixture.database, { date: "2026-11-15" });
    assert.equal(result.reports[0]?.current.totalRevenue, 0);
    assert.equal(result.reports[0]?.current.averageOrderValue, 0);
  } finally { cleanup(fixture); }
});

test("disabled automatic reporting skips without a claim", async () => {
  const fixture = createFixture();
  try {
    fixture.repository.setAnalysisPreference("dailyReportEnabled", "false");
    const result = await runDailyReport(fixture.repository, fixture.database, { now: new Date("2026-11-17T00:00:00Z") });
    assert.equal(result.status, "skipped");
    const row = fixture.database.prepare("SELECT COUNT(*) AS count FROM daily_report_executions").get() as { count: number };
    assert.equal(row.count, 0);
  } finally { cleanup(fixture); }
});

test("automatic first run processes only yesterday", async () => {
  const fixture = createFixture();
  try {
    const result = await runDailyReport(fixture.repository, fixture.database, { now: new Date("2026-11-17T00:00:00Z") });
    assert.deepEqual(result.reportingDates, ["2026-11-16"]);
    assert.equal(fixture.repository.getAnalysisPreference("lastSuccessfulScheduledDate"), "2026-11-16");
  } finally { cleanup(fixture); }
});

test("catch-up processes missing dates in order", async () => {
  const fixture = createFixture();
  try {
    fixture.repository.setAnalysisPreference("lastSuccessfulScheduledDate", "2026-11-13");
    const result = await runDailyReport(fixture.repository, fixture.database, { now: new Date("2026-11-17T00:00:00Z") });
    assert.deepEqual(result.reportingDates, ["2026-11-14", "2026-11-15", "2026-11-16"]);
  } finally { cleanup(fixture); }
});

test("invalid persisted settings fail clearly", async () => {
  const fixture = createFixture();
  try {
    fixture.repository.setAnalysisPreference("timezone", "Not/AZone");
    await assert.rejects(() => runDailyReport(fixture.repository, fixture.database), /valid IANA timezone/);
  } finally { cleanup(fixture); }
});

test("future manual date is rejected", async () => {
  const fixture = createFixture();
  try {
    await assert.rejects(() => runDailyReport(fixture.repository, fixture.database, {
      date: "2026-11-17",
      now: new Date("2026-11-17T00:00:00Z")
    }), /past date/);
  } finally { cleanup(fixture); }
});

test("comparison preference parser rejects zero", () => {
  const fixture = createFixture();
  try {
    fixture.repository.setAnalysisPreference("comparisonDays", "0");
    assert.throws(() => readAnalysisSettings(fixture.repository), /comparisonDays/);
  } finally { cleanup(fixture); }
});

test("configured timezone determines the scheduled reporting date", async () => {
  const fixture = createFixture();
  try {
    fixture.repository.setAnalysisPreference("timezone", "UTC");
    const result = await runDailyReport(fixture.repository, fixture.database, { now: new Date("2026-11-17T00:01:00Z") });
    assert.deepEqual(result.reportingDates, ["2026-11-16"]);
  } finally { cleanup(fixture); }
});

test("report history can be retrieved by its generation key", async () => {
  const fixture = createFixture();
  try {
    await runDailyReport(fixture.repository, fixture.database, { date: "2026-11-15" });
    const report = fixture.repository.getAnalysisReportByGenerationKey("automatic|2026-11-15|2026-11-15|2026-11-15|30|2026-10-16|2026-11-14");
    assert.equal(report?.reportingDate, "2026-11-15");
  } finally { cleanup(fixture); }
});

test("failed PDF metadata is recovered with a PDF-only retry", async () => {
  const fixture = createFixture();
  try {
    const first = await runDailyReport(fixture.repository, fixture.database, { date: "2026-11-15" });
    const report = first.reports[0];
    assert.ok(report?.id);
    fixture.repository.updateAnalysisReportPdf(report.id, { status: "failed", error: "simulated failure" });
    const retry = await runDailyReport(fixture.repository, fixture.database, { date: "2026-11-15" });
    assert.equal(retry.status, "retried");
    assert.equal(fixture.repository.listAnalysisReports().length, 1);
  } finally { cleanup(fixture); }
});

test("stale execution leases can be reclaimed", async () => {
  const fixture = createFixture();
  try {
    const key = "automatic|2026-11-15|2026-11-15|2026-11-15|30|2026-10-16|2026-11-14";
    fixture.database.prepare(`
      INSERT INTO daily_report_executions
        (execution_key, reporting_date, generation_key, status, attempt_count, started_at, lease_expires_at)
      VALUES (?, ?, ?, 'running', 1, ?, ?)
    `).run(key, "2026-11-15", key, "2026-11-15T00:00:00.000Z", "2026-11-15T00:01:00.000Z");
    const result = await runDailyReport(fixture.repository, fixture.database, { date: "2026-11-15", now: new Date("2026-11-17T00:00:00Z") });
    assert.equal(result.reports.length, 1);
    assert.equal((fixture.database.prepare("SELECT status FROM daily_report_executions WHERE execution_key = ?").get(key) as { status: string }).status, "succeeded");
  } finally { cleanup(fixture); }
});

test("concurrent connections produce one successful report", async () => {
  const fixture = createFixture();
  const secondDatabase = new Database(path.join(fixture.directory, "test.sqlite"));
  secondDatabase.pragma("busy_timeout = 5000");
  try {
    const secondRepository = new LocalSqliteSalesRepository(secondDatabase);
    const results = await Promise.all([
      runDailyReport(fixture.repository, fixture.database, { date: "2026-11-15" }),
      runDailyReport(secondRepository, secondDatabase, { date: "2026-11-15" })
    ]);
    assert.equal(fixture.repository.listAnalysisReports().length, 1);
    assert.equal(results.filter(result => result.status === "generated").length, 1);
  } finally {
    secondDatabase.close();
    cleanup(fixture);
  }
});
