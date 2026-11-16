import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  AnalysisDimension,
  AnalysisKpis,
  AnalysisReport,
  AnalysisSnapshot,
  DailyPerformance,
  DailyAnalysisResult,
  DailyNotification,
  SaleInput,
  SaleRecord,
  SalesRepository
} from "../types";
import { SALE_STATUSES } from "../types";

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function mapSale(row: Record<string, unknown>): SaleRecord {
  return {
    saleLineId: String(row.saleLineId),
    orderId: String(row.orderId),
    lineNumber: Number(row.lineNumber),
    orderDate: String(row.orderDate),
    customerName: String(row.customerName),
    customerGender: row.customerGender as SaleRecord["customerGender"],
    customerEmail: String(row.customerEmail),
    customerPhone: String(row.customerPhone),
    productName: String(row.productName),
    category: String(row.category),
    region: String(row.region),
    quantity: Number(row.quantity),
    unitPrice: Number(row.unitPrice),
    unitCost: Number(row.unitCost),
    discountPercent: Number(row.discountPercent),
    customerRating: row.customerRating === null ? null : Number(row.customerRating),
    status: row.status as SaleRecord["status"],
    grossAmount: Number(row.grossAmount),
    discountAmount: Number(row.discountAmount),
    totalRevenue: Number(row.totalRevenue),
    grossProfit: Number(row.grossProfit),
    insertedAt: String(row.insertedAt)
  };
}

function rounded(value: unknown) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function mapKpis(row: Record<string, unknown>): AnalysisKpis {
  const revenue = rounded(row.totalRevenue);
  const profit = rounded(row.grossProfit);
  const orders = Number(row.totalOrders || 0);
  return {
    totalRevenue: revenue,
    totalOrders: orders,
    totalUnitsSold: Number(row.totalUnitsSold || 0),
    totalProductLines: Number(row.totalProductLines || 0),
    grossProfit: profit,
    grossProfitMargin: revenue ? rounded((profit / revenue) * 100) : 0,
    totalDiscounts: rounded(row.totalDiscounts),
    averageOrderValue: orders ? rounded(revenue / orders) : 0,
    averageCustomerRating: row.averageCustomerRating == null ? null : rounded(row.averageCustomerRating)
  };
}

function mapDimension(row: Record<string, unknown>): AnalysisDimension {
  return {
    label: String(row.label),
    revenue: rounded(row.revenue),
    orders: Number(row.orders || 0),
    units: Number(row.units || 0),
    productLines: Number(row.productLines || 0),
    grossProfit: rounded(row.grossProfit),
    discounts: rounded(row.discounts),
    averageRating: row.averageRating == null ? null : rounded(row.averageRating)
  };
}

export class LocalSqliteSalesRepository implements SalesRepository {
  constructor(private readonly database: Database.Database) {}

  insertSale(input: SaleInput): SaleRecord {
    const statement = this.database.prepare(`
      INSERT INTO daily_sales_orders (
        sale_line_id, order_id, line_number, order_date, customer_name,
        customer_gender, customer_email, customer_phone, product_name,
        category, region, quantity, unit_price, unit_cost, discount_percent,
        customer_rating, status
      ) VALUES (
        @saleLineId, @orderId, @lineNumber, @orderDate, @customerName,
        @customerGender, @customerEmail, @customerPhone, @productName,
        @category, @region, @quantity, @unitPrice, @unitCost, @discountPercent,
        @customerRating, @status
      )
    `);
    const values = {
      saleLineId: input.saleLineId || randomUUID(),
      orderId: input.orderId,
      lineNumber: input.lineNumber,
      orderDate: input.orderDate,
      customerName: input.customerName,
      customerGender: input.customerGender || "Not Specified",
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      productName: input.productName,
      category: input.category,
      region: input.region,
      quantity: input.quantity,
      unitPrice: round(input.unitPrice),
      unitCost: round(input.unitCost),
      discountPercent: round(input.discountPercent || 0),
      customerRating: input.customerRating ?? null,
      status: input.status || "Pending"
    };
    statement.run(values);
    return mapSale(this.database.prepare(`
      SELECT sale_line_id AS saleLineId, order_id AS orderId, line_number AS lineNumber,
        order_date AS orderDate, customer_name AS customerName, customer_gender AS customerGender,
        customer_email AS customerEmail, customer_phone AS customerPhone, product_name AS productName,
        category, region, quantity, unit_price AS unitPrice, unit_cost AS unitCost,
        discount_percent AS discountPercent, gross_amount AS grossAmount,
        discount_amount AS discountAmount, total_revenue AS totalRevenue,
        gross_profit AS grossProfit, customer_rating AS customerRating, status,
        inserted_at AS insertedAt
      FROM daily_sales_orders WHERE sale_line_id = ?
    `).get(values.saleLineId) as Record<string, unknown>);
  }

  listSales(limit = 100): SaleRecord[] {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 1000);
    return this.database.prepare(`
      SELECT sale_line_id AS saleLineId, order_id AS orderId, line_number AS lineNumber,
        order_date AS orderDate, customer_name AS customerName, customer_gender AS customerGender,
        customer_email AS customerEmail, customer_phone AS customerPhone, product_name AS productName,
        category, region, quantity, unit_price AS unitPrice, unit_cost AS unitCost,
        discount_percent AS discountPercent, gross_amount AS grossAmount,
        discount_amount AS discountAmount, total_revenue AS totalRevenue,
        gross_profit AS grossProfit, customer_rating AS customerRating, status,
        inserted_at AS insertedAt
      FROM daily_sales_orders ORDER BY order_date DESC, inserted_at DESC LIMIT ?
    `).all(safeLimit) as SaleRecord[];
  }

  analyzePeriod(periodStart: string, periodEnd: string, analysisDate = periodEnd): DailyAnalysisResult {
    const result = this.database.prepare(`
      SELECT
        COUNT(DISTINCT order_id) AS orderCount,
        COUNT(*) AS lineCount,
        COALESCE(SUM(quantity), 0) AS totalQuantity,
        ROUND(COALESCE(SUM(total_revenue), 0), 2) AS totalRevenue,
        ROUND(COALESCE(SUM(gross_profit), 0), 2) AS totalGrossProfit
      FROM daily_sales_orders
      WHERE order_date BETWEEN ? AND ?
        AND status = 'Completed'
    `).get(periodStart, periodEnd) as {
      orderCount: number;
      lineCount: number;
      totalQuantity: number;
      totalRevenue: number;
      totalGrossProfit: number;
    };

    const analysis: DailyAnalysisResult = {
      analysisDate,
      periodStart,
      periodEnd,
      orderCount: result.orderCount,
      lineCount: result.lineCount,
      totalQuantity: result.totalQuantity,
      totalRevenue: round(result.totalRevenue),
      totalGrossProfit: round(result.totalGrossProfit),
      averageOrderValue: result.orderCount ? round(result.totalRevenue / result.orderCount) : 0,
      generatedAt: new Date().toISOString()
    };

    this.database.prepare(`
      INSERT INTO daily_analysis_results (
        analysis_date, period_start, period_end, order_count, line_count,
        total_quantity, total_revenue, total_gross_profit, average_order_value,
        generated_at
      ) VALUES (
        @analysisDate, @periodStart, @periodEnd, @orderCount, @lineCount,
        @totalQuantity, @totalRevenue, @totalGrossProfit, @averageOrderValue,
        @generatedAt
      )
      ON CONFLICT (analysis_date, period_start, period_end) DO UPDATE SET
        order_count = excluded.order_count,
        line_count = excluded.line_count,
        total_quantity = excluded.total_quantity,
        total_revenue = excluded.total_revenue,
        total_gross_profit = excluded.total_gross_profit,
        average_order_value = excluded.average_order_value,
        generated_at = excluded.generated_at
    `).run(analysis);

    const notificationType = analysis.totalRevenue === 0 ? "no-revenue" : "period-summary";
    const message = analysis.totalRevenue === 0
      ? `No eligible sales were recorded from ${periodStart} to ${periodEnd}.`
      : `Revenue for ${periodStart} to ${periodEnd} is ${analysis.totalRevenue.toFixed(2)} with ${analysis.orderCount} orders.`;
    this.database.prepare(`
      INSERT INTO daily_notifications (analysis_date, notification_type, message, severity)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (analysis_date, notification_type) DO UPDATE SET
        message = excluded.message,
        severity = excluded.severity,
        created_at = CURRENT_TIMESTAMP
    `).run(analysisDate, notificationType, message, analysis.totalRevenue === 0 ? "warning" : "info");

    return analysis;
  }

  listNotifications(limit = 100): DailyNotification[] {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 1000);
    return this.database.prepare(`
      SELECT id, analysis_date AS analysisDate, notification_type AS notificationType,
        message, severity, is_read AS isRead, created_at AS createdAt
      FROM daily_notifications
      ORDER BY created_at DESC
      LIMIT ?
    `).all(safeLimit) as DailyNotification[];
  }

  getAnalysisSnapshot(periodStart: string, periodEnd: string): AnalysisSnapshot {
    const row = this.database.prepare(`
      SELECT COALESCE(SUM(total_revenue), 0) AS totalRevenue,
        COUNT(DISTINCT order_id) AS totalOrders, COALESCE(SUM(quantity), 0) AS totalUnitsSold,
        COUNT(*) AS totalProductLines, COALESCE(SUM(gross_profit), 0) AS grossProfit,
        COALESCE(SUM(discount_amount), 0) AS totalDiscounts, AVG(customer_rating) AS averageCustomerRating
      FROM daily_sales_orders
      WHERE order_date BETWEEN ? AND ? AND status = 'Completed'
    `).get(periodStart, periodEnd) as Record<string, unknown>;
    const distribution = Object.fromEntries(SALE_STATUSES.map(status => [status, 0])) as AnalysisSnapshot["statusDistribution"];
    const statuses = this.database.prepare(`
      SELECT status, COUNT(DISTINCT order_id) AS count FROM daily_sales_orders
      WHERE order_date BETWEEN ? AND ? GROUP BY status
    `).all(periodStart, periodEnd) as Array<{ status: string; count: number }>;
    for (const status of statuses) {
      if (status.status in distribution) distribution[status.status as keyof typeof distribution] = status.count;
    }
    return { ...mapKpis(row), periodStart, periodEnd, statusDistribution: distribution };
  }

  getDailyPerformance(periodStart: string, periodEnd: string): DailyPerformance[] {
    const rows = this.database.prepare(`
      SELECT order_date AS date, COALESCE(SUM(total_revenue), 0) AS totalRevenue,
        COUNT(DISTINCT order_id) AS totalOrders, COALESCE(SUM(quantity), 0) AS totalUnitsSold,
        COUNT(*) AS totalProductLines, COALESCE(SUM(gross_profit), 0) AS grossProfit,
        COALESCE(SUM(discount_amount), 0) AS totalDiscounts, AVG(customer_rating) AS averageCustomerRating
      FROM daily_sales_orders
      WHERE order_date BETWEEN ? AND ? AND status = 'Completed'
      GROUP BY order_date ORDER BY order_date
    `).all(periodStart, periodEnd) as Array<Record<string, unknown>>;
    const byDate = new Map(rows.map(row => [String(row.date), mapKpis(row)]));
    const result: DailyPerformance[] = [];
    for (let cursor = periodStart; cursor <= periodEnd; cursor = new Date(`${cursor}T00:00:00Z`).toISOString().slice(0, 10)) {
      result.push({ date: cursor, ...(byDate.get(cursor) || mapKpis({})) });
      if (cursor === periodEnd) break;
    }
    return result;
  }

  getDimensionPerformance(dimension: "product_name" | "category" | "region" | "customer_gender", periodStart: string, periodEnd: string): AnalysisDimension[] {
    const column = dimension;
    return this.database.prepare(`
      SELECT ${column} AS label, COALESCE(SUM(total_revenue), 0) AS revenue,
        COUNT(DISTINCT order_id) AS orders, COALESCE(SUM(quantity), 0) AS units,
        COUNT(*) AS productLines, COALESCE(SUM(gross_profit), 0) AS grossProfit,
        COALESCE(SUM(discount_amount), 0) AS discounts, AVG(customer_rating) AS averageRating
      FROM daily_sales_orders
      WHERE order_date BETWEEN ? AND ? AND status = 'Completed'
      GROUP BY ${column} ORDER BY revenue DESC, label
    `).all(periodStart, periodEnd).map(row => mapDimension(row as Record<string, unknown>));
  }

  getFirstSaleDate(): string | null {
    const row = this.database.prepare("SELECT MIN(order_date) AS firstDate FROM daily_sales_orders").get() as { firstDate?: string };
    return row.firstDate || null;
  }

  getAnalysisPreference(key: string): string | null {
    const row = this.database.prepare("SELECT preference_value AS value FROM daily_analysis_preferences WHERE preference_key = ?").get(key) as { value?: string } | undefined;
    return row?.value || null;
  }

  setAnalysisPreference(key: string, value: string) {
    this.database.prepare(`
      INSERT INTO daily_analysis_preferences (preference_key, preference_value) VALUES (?, ?)
      ON CONFLICT (preference_key) DO UPDATE SET preference_value = excluded.preference_value
    `).run(key, value);
  }

  saveAnalysisReport(report: AnalysisReport): AnalysisReport {
    const result = this.database.prepare(`
      INSERT INTO daily_analysis_reports
        (report_kind, reporting_date, period_start, period_end, comparison_days, comparison_start, comparison_end, report_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(report.reportKind, report.reportingDate, report.periodStart, report.periodEnd, report.comparisonDays, report.comparisonStart, report.comparisonEnd, JSON.stringify(report));
    return { ...report, id: Number(result.lastInsertRowid) };
  }

  listAnalysisReports(limit = 50): AnalysisReport[] {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const rows = this.database.prepare("SELECT id, report_json AS reportJson FROM daily_analysis_reports ORDER BY generated_at DESC, id DESC LIMIT ?").all(safeLimit) as Array<{ id: number; reportJson: string }>;
    return rows.map(row => ({ ...(JSON.parse(row.reportJson) as AnalysisReport), id: row.id }));
  }
}
