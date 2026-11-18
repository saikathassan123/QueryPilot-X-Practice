import type { Session } from "../../src/lib/session";
import { getPostgresRows, getPostgresTables, type Table } from "../../src/lib/database";
import { getOAuthTables, runOAuthReadOnlyQuery } from "../../src/lib/supabase";
import { availableMetricsForMapping, detectDatasetColumns, suggestDatasetMapping, type DatasetMapping } from "./dataset-mapping";
import { addDays } from "../analysis-service";
import type {
  AnalysisDimension, AnalysisKpis, AnalysisReport, AnalysisSnapshot, DailyPerformance,
  DailyAnalysisResult, DailyNotification, SaleInput, SaleRecord, SalesRepository, SaleStatus
} from "../types";
import { SALE_STATUSES } from "../types";

export type DatasetSelection = { table: string; mapping?: Partial<DatasetMapping> };

function rounded(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizedName(value: string | undefined) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function identifier(value: string, columns: string[]) {
  if (!columns.includes(value)) throw new Error(`Column "${value}" is not available in the selected table.`);
  return value;
}

function numberValue(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;
  const result = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(result) ? result : 0;
}

function nullableNumberValue(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const result = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(result) ? result : null;
}

function formatDhakaDate(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).reduce<Record<string, string>>((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function dateValue(value: unknown): string | null {
  if (value instanceof Date) return formatDhakaDate(value);
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const plainDate = text.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(plainDate) && (text.length === 10 || /^[T ]00:00:00(?:\.0+)?Z?$/.test(text.slice(10)))) {
    const parsed = new Date(`${plainDate}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === plainDate ? plainDate : null;
  }
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(text)) {
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return formatDhakaDate(parsed);
    const fallback = new Date(`${plainDate}T00:00:00Z`);
    return !Number.isNaN(fallback.getTime()) && fallback.toISOString().slice(0, 10) === plainDate ? plainDate : null;
  }
  const parsed = new Date(text);
  return formatDhakaDate(parsed);
}

function textValue(value: unknown, fallback: string) {
  return value === null || value === undefined || String(value).trim() === "" ? fallback : String(value).trim();
}

export function mappedRows(rows: Array<Record<string, unknown>>, mapping: DatasetMapping): SaleRecord[] {
  const revenueColNorm = normalizedName(mapping.revenue);
  const isUnitPrice = Boolean(mapping.revenue && mapping.quantity && (revenueColNorm === "unitprice" || revenueColNorm === "itemprice" || revenueColNorm === "price"));
  const discountColNorm = normalizedName(mapping.discount);
  const isDiscountPercent = discountColNorm.includes("percent") || discountColNorm.includes("pct") || discountColNorm.includes("rate");
  const costColNorm = normalizedName(mapping.cost);
  const isCostProfit = costColNorm.includes("profit");
  const isTotalCost = costColNorm.includes("totalcost") || costColNorm.includes("linecost") || costColNorm === "cogs";

  return rows.map((row, index) => {
    const rawOrderId = row[mapping.orderId];
    const orderId = rawOrderId === null || rawOrderId === undefined ? "" : String(rawOrderId).trim();
    const orderDate = dateValue(row[mapping.orderDate]);
    if (!orderId || !orderDate) return null;

    const quantity = mapping.quantity ? numberValue(row[mapping.quantity]) : 0;
    const rawRevenue = mapping.revenue ? numberValue(row[mapping.revenue]) : 0;
    const rawDiscount = mapping.discount ? numberValue(row[mapping.discount]) : 0;

    let grossAmount = 0;
    let discountAmount = 0;
    let totalRevenue = 0;
    let unitPrice = 0;

    if (isUnitPrice) {
      unitPrice = rounded(rawRevenue);
      grossAmount = rounded(unitPrice * quantity);
      discountAmount = mapping.discount
        ? rounded(isDiscountPercent ? (grossAmount * rawDiscount) / 100 : rawDiscount)
        : 0;
      totalRevenue = rounded(grossAmount - discountAmount);
    } else {
      totalRevenue = rounded(rawRevenue);
      discountAmount = mapping.discount
        ? rounded(isDiscountPercent ? (totalRevenue * rawDiscount) / 100 : rawDiscount)
        : 0;
      grossAmount = rounded(totalRevenue + discountAmount);
      unitPrice = quantity > 0 ? rounded(totalRevenue / quantity) : totalRevenue;
    }

    const rawCost = mapping.cost ? numberValue(row[mapping.cost]) : 0;
    const rawProfit = mapping.profit ? nullableNumberValue(row[mapping.profit]) : null;
    let grossProfit = 0;
    if (rawProfit !== null) {
      grossProfit = rounded(rawProfit);
    } else if (mapping.cost) {
      if (isCostProfit) {
        grossProfit = rounded(rawCost);
      } else if (isTotalCost || !mapping.quantity) {
        grossProfit = rounded(totalRevenue - rawCost);
      } else {
        grossProfit = rounded(totalRevenue - rawCost * quantity);
      }
    }

    const statusValue = mapping.status
      ? textValue(row[mapping.status], "Pending")
      : "Unavailable";

    return {
      saleLineId: `${orderId}-${index + 1}`,
      orderId,
      lineNumber: index + 1,
      orderDate,
      customerName: "Unavailable",
      customerGender: textValue(mapping.gender ? row[mapping.gender] : undefined, "Unavailable") as SaleRecord["customerGender"],
      customerEmail: "Unavailable",
      customerPhone: "Unavailable",
      productName: textValue(mapping.product ? row[mapping.product] : undefined, "Unavailable"),
      category: textValue(mapping.category ? row[mapping.category] : undefined, "Unavailable"),
      region: textValue(mapping.region ? row[mapping.region] : undefined, "Unavailable"),
      quantity,
      unitPrice,
      unitCost: isCostProfit ? 0 : rounded(rawCost),
      discountPercent: isDiscountPercent ? rounded(rawDiscount) : 0,
      customerRating: mapping.rating ? nullableNumberValue(row[mapping.rating]) : null,
      status: statusValue as SaleRecord["status"],
      grossAmount,
      discountAmount,
      totalRevenue,
      grossProfit,
      insertedAt: new Date().toISOString()
    };
  }).filter((row): row is SaleRecord => Boolean(row));
}

function inRange(row: SaleRecord, start: string, end: string) {
  return row.orderDate >= start && row.orderDate <= end;
}

const COMPLETED_STATUSES = new Set([
  "completed", "complete", "delivered", "paid", "success", "successful", "fulfilled", "done", "unavailable"
]);

function completed(row: SaleRecord) {
  return COMPLETED_STATUSES.has(row.status.trim().toLowerCase());
}

function kpis(rows: SaleRecord[]): AnalysisKpis {
  const eligible = rows.filter(completed);
  const revenue = rounded(eligible.reduce((sum, row) => sum + row.totalRevenue, 0));
  const profit = rounded(eligible.reduce((sum, row) => sum + row.grossProfit, 0));
  const orders = new Set(eligible.map(row => row.orderId)).size;
  const ratings = eligible.filter(row => row.customerRating !== null).map(row => row.customerRating as number);
  return {
    totalRevenue: revenue,
    totalOrders: orders,
    totalUnitsSold: eligible.reduce((sum, row) => sum + row.quantity, 0),
    totalProductLines: eligible.length,
    grossProfit: profit,
    grossProfitMargin: revenue ? rounded((profit / revenue) * 100) : 0,
    totalDiscounts: rounded(eligible.reduce((sum, row) => sum + row.discountAmount, 0)),
    averageOrderValue: orders ? rounded(revenue / orders) : 0,
    averageCustomerRating: ratings.length ? rounded(ratings.reduce((sum, value) => sum + value, 0) / ratings.length) : null
  };
}

export class SupabaseSalesRepository implements SalesRepository {
  private readonly reports = new Map<number, AnalysisReport>();
  private readonly preferences = new Map<string, string>();
  private readonly notifications: DailyNotification[] = [];
  private nextReportId = 1;

  constructor(private readonly rows: SaleRecord[]) {}

  insertSale(_input: SaleInput): SaleRecord {
    throw new Error("Supabase Daily Analysis is read-only.");
  }

  listSales(limit = 100) {
    return this.rows.slice(0, Math.min(Math.max(Math.trunc(limit), 1), 1000));
  }

  analyzePeriod(periodStart: string, periodEnd: string, analysisDate = periodEnd): DailyAnalysisResult {
    const current = kpis(this.rows.filter(row => inRange(row, periodStart, periodEnd)));
    const result: DailyAnalysisResult = {
      analysisDate,
      periodStart,
      periodEnd,
      orderCount: current.totalOrders,
      lineCount: current.totalProductLines,
      totalQuantity: current.totalUnitsSold,
      totalRevenue: current.totalRevenue,
      totalGrossProfit: current.grossProfit,
      averageOrderValue: current.averageOrderValue,
      generatedAt: new Date().toISOString()
    };
    const notificationType = result.totalRevenue === 0 ? "no-revenue" : "period-summary";
    const message = result.totalRevenue === 0
      ? `No eligible sales were recorded from ${periodStart} to ${periodEnd}.`
      : `Revenue for ${periodStart} to ${periodEnd} is ${result.totalRevenue.toFixed(2)} with ${result.orderCount} orders.`;
    this.notifications.unshift({
      id: this.notifications.length + 1,
      analysisDate,
      notificationType,
      message,
      severity: result.totalRevenue === 0 ? "warning" : "info",
      isRead: false,
      createdAt: result.generatedAt
    });
    return result;
  }

  listNotifications(limit = 100): DailyNotification[] {
    return this.notifications.slice(0, Math.min(Math.max(Math.trunc(limit), 1), 1000));
  }

  getAnalysisSnapshot(periodStart: string, periodEnd: string): AnalysisSnapshot {
    const rows = this.rows.filter(row => inRange(row, periodStart, periodEnd));
    const byStatus = new Map<SaleStatus, Set<string>>(SALE_STATUSES.map(status => [status, new Set<string>()]));
    for (const row of rows) {
      const normalized = row.status.trim().toLowerCase();
      const status = COMPLETED_STATUSES.has(normalized)
        ? "Completed"
        : SALE_STATUSES.find(value => value.toLowerCase() === normalized);
      if (status) byStatus.get(status)?.add(row.orderId);
    }
    const statusDistribution = Object.fromEntries(
      SALE_STATUSES.map(status => [status, byStatus.get(status)?.size || 0])
    ) as AnalysisSnapshot["statusDistribution"];
    return { ...kpis(rows), periodStart, periodEnd, statusDistribution };
  }

  getDailyPerformance(periodStart: string, periodEnd: string): DailyPerformance[] {
    const byDate = new Map<string, SaleRecord[]>();
    for (const row of this.rows) {
      if (inRange(row, periodStart, periodEnd)) {
        const list = byDate.get(row.orderDate) || [];
        list.push(row);
        byDate.set(row.orderDate, list);
      }
    }
    const result: DailyPerformance[] = [];
    for (let cursor = periodStart; cursor <= periodEnd; cursor = addDays(cursor, 1)) {
      result.push({ date: cursor, ...kpis(byDate.get(cursor) || []) });
      if (cursor === periodEnd) break;
    }
    return result;
  }

  getDimensionPerformance(dimension: "product_name" | "category" | "region" | "customer_gender", periodStart: string, periodEnd: string): AnalysisDimension[] {
    const key = ({ product_name: "productName", category: "category", region: "region", customer_gender: "customerGender" } as const)[dimension];
    const groups = new Map<string, SaleRecord[]>();
    for (const row of this.rows.filter(value => inRange(value, periodStart, periodEnd) && completed(value))) {
      const label = row[key];
      if (!label || label === "Unavailable") continue;
      const group = groups.get(label) || [];
      group.push(row);
      groups.set(label, group);
    }
    return [...groups].map(([label, rows]) => {
      const values = kpis(rows);
      return {
        label,
        revenue: values.totalRevenue,
        orders: values.totalOrders,
        units: values.totalUnitsSold,
        productLines: values.totalProductLines,
        grossProfit: values.grossProfit,
        discounts: values.totalDiscounts,
        averageRating: values.averageCustomerRating
      };
    }).sort((a, b) => b.revenue - a.revenue || a.label.localeCompare(b.label));
  }

  getFirstSaleDate() {
    if (!this.rows.length) return null;
    return this.rows.reduce((min, row) => (row.orderDate < min ? row.orderDate : min), this.rows[0].orderDate);
  }

  getLatestSaleDate() {
    if (!this.rows.length) return null;
    return this.rows.reduce((max, row) => (row.orderDate > max ? row.orderDate : max), this.rows[0].orderDate);
  }

  getAnalysisPreference(key: string) { return this.preferences.get(key) || null; }
  setAnalysisPreference(key: string, value: string) { this.preferences.set(key, value); }
  getAnalysisPreferences() { return Object.fromEntries(this.preferences); }

  saveAnalysisReport(report: AnalysisReport) {
    if (report.generationKey) {
      const existing = this.getAnalysisReportByGenerationKey(report.generationKey);
      if (existing) return existing;
    }
    const id = Date.now() + (this.nextReportId++);
    const stored: AnalysisReport = {
      ...report,
      id,
      generationStatus: "generated",
      pdfStatus: "not_generated",
      pdfFilename: null,
      pdfGeneratedAt: null,
      pdfSizeBytes: null,
      pdfError: null
    };
    this.reports.set(id, stored);
    return stored;
  }

  getAnalysisReport(id: number) { return this.reports.get(id) || null; }
  getAnalysisReportByGenerationKey(key: string) { return [...this.reports.values()].find(report => report.generationKey === key) || null; }
  listAnalysisReports(limit = 50) { return [...this.reports.values()].slice(-Math.min(Math.max(Math.trunc(limit), 1), 100)).reverse(); }
  updateAnalysisReportPdf(id: number, metadata: {
    status: "generated" | "failed";
    filename?: string;
    generatedAt?: string;
    sizeBytes?: number;
    error?: string;
  }) {
    const existing = this.reports.get(id);
    if (!existing) return;
    this.reports.set(id, {
      ...existing,
      pdfStatus: metadata.status,
      pdfFilename: metadata.filename ?? existing.pdfFilename ?? null,
      pdfGeneratedAt: metadata.generatedAt ?? existing.pdfGeneratedAt ?? null,
      pdfSizeBytes: metadata.sizeBytes ?? existing.pdfSizeBytes ?? null,
      pdfError: metadata.error ?? null
    });
  }
}

async function tableFor(session: Session, selection: DatasetSelection): Promise<Table> {
  const tables = session.mode === "oauth" ? await getOAuthTables(session) : await getPostgresTables(session.dbUrl || "");
  if (!tables.length) throw new Error("No readable public tables were found in the connected Supabase project.");
  if (selection.table) {
    const exact = tables.find(value => value.name === selection.table);
    if (exact) return exact;
    if (selection.table !== "daily_sales_orders") {
      throw new Error(`Table "${selection.table}" was not found in the connected Supabase project.`);
    }
  }
  const table = tables.find(value => value.name === "daily_sales_orders")
    || tables.find(value => {
      const detected = detectDatasetColumns(value);
      return Boolean(detected.orderId && detected.orderDate);
    })
    || tables[0];
  if (!table) throw new Error("Select a public Supabase table for Daily Analysis.");
  return table;
}

export async function createSupabaseSalesRepository(session: Session, selection: DatasetSelection) {
  const table = await tableFor(session, selection);
  const cleanOverrides = Object.fromEntries(
    Object.entries(selection.mapping || {}).filter(([, value]) => typeof value === "string" && value.trim() !== "")
  ) as Partial<DatasetMapping>;
  const mapping = suggestDatasetMapping(table, cleanOverrides);
  for (const value of Object.values(mapping).filter(Boolean)) {
    identifier(value as string, table.columns);
  }
  const quoted = `"${table.name.replace(/"/g, `""`)}"`;
  const rows = session.mode === "oauth"
    ? await runOAuthReadOnlyQuery(session, `SELECT * FROM public.${quoted} LIMIT 10000`)
    : await getPostgresRows(session.dbUrl || "", table.name);
  return {
    repository: new SupabaseSalesRepository(mappedRows(rows, mapping)),
    table,
    mapping,
    availableMetrics: availableMetricsForMapping(mapping)
  };
}

