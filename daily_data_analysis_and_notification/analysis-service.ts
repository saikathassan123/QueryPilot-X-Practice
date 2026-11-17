import type { AnalysisKpis, AnalysisReport, DailyPerformance, SalesRepository } from "./types";

const TIME_ZONE = "Asia/Dhaka";
const DEFAULT_COMPARISON_DAYS = 30;

function dhakaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date()).reduce<Record<string, string>>((result, part) => {
      if (part.type !== "literal") result[part.type] = part.value;
      return result;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(value.getTime())) throw new Error("Invalid date.");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function addMonths(date: string, months: number) {
  const value = new Date(`${date}T00:00:00Z`);
  const day = value.getUTCDate();
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate();
  value.setUTCDate(Math.min(day, lastDay));
  return value.toISOString().slice(0, 10);
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function assertRange(start: string, end: string) {
  if (!validDate(start) || !validDate(end)) throw new Error("Dates must use YYYY-MM-DD.");
  if (start > end) throw new Error("The start date must not be after the end date.");
}

function average(days: DailyPerformance[]): AnalysisKpis {
  const empty: AnalysisKpis = { totalRevenue: 0, totalOrders: 0, totalUnitsSold: 0, totalProductLines: 0, grossProfit: 0, grossProfitMargin: 0, totalDiscounts: 0, averageOrderValue: 0, averageCustomerRating: null };
  if (!days.length) return empty;
  const sum = days.reduce((result, day) => ({
    revenue: result.revenue + day.totalRevenue, orders: result.orders + day.totalOrders,
    units: result.units + day.totalUnitsSold, lines: result.lines + day.totalProductLines,
    profit: result.profit + day.grossProfit, discounts: result.discounts + day.totalDiscounts,
    rating: result.rating + (day.averageCustomerRating || 0), rated: result.rated + (day.averageCustomerRating === null ? 0 : 1)
  }), { revenue: 0, orders: 0, units: 0, lines: 0, profit: 0, discounts: 0, rating: 0, rated: 0 });
  return {
    totalRevenue: sum.revenue / days.length, totalOrders: sum.orders / days.length,
    totalUnitsSold: sum.units / days.length, totalProductLines: sum.lines / days.length,
    grossProfit: sum.profit / days.length, grossProfitMargin: sum.revenue ? (sum.profit / sum.revenue) * 100 : 0,
    totalDiscounts: sum.discounts / days.length, averageOrderValue: sum.orders ? sum.revenue / sum.orders : 0,
    averageCustomerRating: sum.rated ? sum.rating / sum.rated : null
  };
}

function buildReport(repository: SalesRepository, reportKind: "automatic" | "historical", reportingDate: string, periodStart: string, periodEnd: string, comparisonDays: number | null, comparisonStart: string | null, comparisonEnd: string | null, persist = true) {
  assertRange(periodStart, periodEnd);
  if (comparisonStart && comparisonEnd) assertRange(comparisonStart, comparisonEnd);
  const report: AnalysisReport = {
    reportKind, reportingDate, periodStart, periodEnd, comparisonDays, comparisonStart, comparisonEnd,
    current: repository.getAnalysisSnapshot(periodStart, periodEnd),
    comparison: comparisonStart && comparisonEnd ? repository.getAnalysisSnapshot(comparisonStart, comparisonEnd) : null,
    comparisonDailyAverage: comparisonStart && comparisonEnd ? average(repository.getDailyPerformance(comparisonStart, comparisonEnd)) : null,
    dailyPerformance: repository.getDailyPerformance(periodStart, periodEnd),
    productPerformance: repository.getDimensionPerformance("product_name", periodStart, periodEnd),
    categoryPerformance: repository.getDimensionPerformance("category", periodStart, periodEnd),
    regionPerformance: repository.getDimensionPerformance("region", periodStart, periodEnd),
    genderPerformance: repository.getDimensionPerformance("customer_gender", periodStart, periodEnd),
    generatedAt: new Date().toISOString(),
    status: "generated"
  };
  report.generationKey = [
    report.reportKind,
    report.reportingDate,
    report.periodStart,
    report.periodEnd,
    report.comparisonDays ?? "",
    report.comparisonStart ?? "",
    report.comparisonEnd ?? ""
  ].join("|");
  return persist ? repository.saveAnalysisReport(report) : report;
}

export function comparisonDays(value: number | string | null | undefined) {
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error("comparisonDays must be a whole number between 1 and 3650.");
  return days;
}

export function generateAutomaticReport(repository: SalesRepository, requestedDays?: number) {
  const days = requestedDays === undefined
    ? comparisonDays(repository.getAnalysisPreference("comparisonDays") || DEFAULT_COMPARISON_DAYS)
    : comparisonDays(requestedDays);
  repository.setAnalysisPreference("comparisonDays", String(days));
  const reportingDate = addDays(dhakaDate(), -1);
  return buildReport(repository, "automatic", reportingDate, reportingDate, reportingDate, days, addDays(reportingDate, -days), addDays(reportingDate, -1));
}

export function generateAutomaticReportForDate(repository: SalesRepository, reportingDate: string, requestedDays?: number, persist = true) {
  if (!validDate(reportingDate)) throw new Error("Reporting date must use YYYY-MM-DD.");
  const days = requestedDays === undefined
    ? comparisonDays(repository.getAnalysisPreference("comparisonDays") || DEFAULT_COMPARISON_DAYS)
    : comparisonDays(requestedDays);
  return buildReport(repository, "automatic", reportingDate, reportingDate, reportingDate, days, addDays(reportingDate, -days), addDays(reportingDate, -1), persist);
}

export type HistoricalRange = "week" | "three-months" | "year" | "all" | "custom";

export function generateHistoricalReport(repository: SalesRepository, range: HistoricalRange, customStart?: string, customEnd?: string) {
  if (range === "custom" && (!customStart || !customEnd)) throw new Error("Custom historical reports require both a start date and an end date.");
  const end = customEnd || dhakaDate();
  const start = range === "custom" ? customStart as string : range === "week" ? addDays(end, -6) : range === "three-months" ? addMonths(end, -3) : range === "year" ? addMonths(end, -12) : customStart || repository.getFirstSaleDate() || end;
  return buildReport(repository, "historical", end, start, end, null, null, null);
}

export function listReports(repository: SalesRepository, limit?: number) {
  return repository.listAnalysisReports(limit);
}
