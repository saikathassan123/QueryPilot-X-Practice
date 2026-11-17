import assert from "node:assert/strict";
import test from "node:test";
import { availableMetricsForMapping, detectDatasetColumns, suggestDatasetMapping } from "../database/dataset-mapping";
import { dateValue, mappedRows, SupabaseSalesRepository } from "../database/supabase-sales-repository";
import { generateAutomaticReportForDate, generateHistoricalReport } from "../analysis-service";
import { renderAnalysisReport } from "../pdf/report-pdf";

test("maps common Supabase sales aliases", () => {
  const mapping = suggestDatasetMapping({
    name: "orders",
    columns: ["invoice_id", "sale_date", "item_name", "qty", "amount", "unit_cost", "order_status", "customer_gender", "area"]
  });
  assert.equal(mapping.orderId, "invoice_id");
  assert.equal(mapping.orderDate, "sale_date");
  assert.equal(mapping.product, "item_name");
  assert.equal(mapping.quantity, "qty");
  assert.equal(mapping.revenue, "amount");
  assert.equal(mapping.cost, "unit_cost");
  assert.equal(mapping.status, "order_status");
  assert.equal(mapping.gender, "customer_gender");
  assert.equal(mapping.region, "area");
});

test("rejects a table without required identity and date columns unless overridden", () => {
  assert.throws(() => suggestDatasetMapping({ name: "events", columns: ["name", "value"] }), /order ID and order date/);
  const overridden = suggestDatasetMapping(
    { name: "custom_sales", columns: ["tx_ref", "booked_on", "net_total"] },
    { orderId: "tx_ref", orderDate: "booked_on", revenue: "net_total" }
  );
  assert.equal(overridden.orderId, "tx_ref");
  assert.equal(overridden.orderDate, "booked_on");
  assert.equal(overridden.revenue, "net_total");
});

test("tracks available KPIs accurately for partial table mappings", () => {
  const detected = detectDatasetColumns({
    name: "minimal_orders",
    columns: ["order_id", "order_date", "amount"]
  });
  const metrics = availableMetricsForMapping(detected);
  assert.deepEqual(metrics, ["totalOrders", "totalProductLines", "totalRevenue", "averageOrderValue"]);
  assert.equal(metrics.includes("grossProfit"), false);
  assert.equal(metrics.includes("averageCustomerRating"), false);
});

test("counts distinct orders across multiple product lines and handles missing fields without inventing values", () => {
  const mapping = suggestDatasetMapping({
    name: "supabase_sales",
    columns: ["order_id", "order_date", "product_name", "category", "quantity", "total_revenue", "unit_cost", "discount_amount", "status", "customer_rating"]
  });
  const rawRows = [
    {
      order_id: "ORD-100",
      order_date: "2026-11-15",
      product_name: "Laptop",
      category: "Electronics",
      quantity: 1,
      total_revenue: 1000,
      unit_cost: 700,
      discount_amount: 50,
      status: "Completed",
      customer_rating: 4.5
    },
    {
      order_id: "ORD-100",
      order_date: "2026-11-15",
      product_name: "Mouse",
      category: "Electronics",
      quantity: 2,
      total_revenue: 100,
      unit_cost: 25,
      discount_amount: 0,
      status: "Completed",
      customer_rating: null
    },
    {
      order_id: "ORD-101",
      order_date: "2026-11-15",
      product_name: "Desk",
      category: "Furniture",
      quantity: 1,
      total_revenue: 400,
      unit_cost: 250,
      discount_amount: 20,
      status: "Cancelled",
      customer_rating: 2.0
    },
    {
      order_id: "ORD-102",
      order_date: "2026-11-10",
      product_name: "Laptop",
      category: "Electronics",
      quantity: 1,
      total_revenue: 900,
      unit_cost: 700,
      discount_amount: 100,
      status: "Completed",
      customer_rating: 5.0
    }
  ];

  const records = mappedRows(rawRows, mapping);
  const repository = new SupabaseSalesRepository(records);
  const snapshot = repository.getAnalysisSnapshot("2026-11-15", "2026-11-15");

  assert.equal(snapshot.totalOrders, 1);
  assert.equal(snapshot.totalProductLines, 2);
  assert.equal(snapshot.totalUnitsSold, 3);
  assert.equal(snapshot.totalRevenue, 1100);
  assert.equal(snapshot.grossProfit, 350);
  assert.equal(snapshot.totalDiscounts, 50);
  assert.equal(snapshot.averageOrderValue, 1100);
  assert.equal(snapshot.averageCustomerRating, 4.5);
  assert.equal(snapshot.statusDistribution.Completed, 1);
  assert.equal(snapshot.statusDistribution.Cancelled, 1);
  assert.equal(repository.getDimensionPerformance("region", "2026-11-15", "2026-11-15").length, 0);
});

test("preserves Asia/Dhaka dates, zero-sales days, comparison averages, report history and in-memory PDF generation", async () => {
  assert.equal(dateValue(new Date("2026-11-15T18:30:00.000Z")), "2026-11-16");
  assert.equal(dateValue("2026-11-15"), "2026-11-15");

  const mapping = suggestDatasetMapping({
    name: "orders",
    columns: ["order_id", "order_date", "quantity", "unit_price", "unit_cost", "discount_percent"]
  });
  const records = mappedRows([
    { order_id: "ORD-1", order_date: "2026-11-15", quantity: 2, unit_price: 200, unit_cost: 120, discount_percent: 10 },
    { order_id: "ORD-2", order_date: "2026-11-13", quantity: 1, unit_price: 300, unit_cost: 180, discount_percent: 0 }
  ], mapping);

  const repository = new SupabaseSalesRepository(records);
  const autoReport = generateAutomaticReportForDate(repository, "2026-11-15", 7);
  assert.equal(autoReport.current.totalRevenue, 360);
  assert.equal(autoReport.current.totalDiscounts, 40);
  assert.equal(autoReport.current.grossProfit, 120);
  assert.equal(autoReport.comparisonDays, 7);
  assert.equal(autoReport.comparisonStart, "2026-11-08");
  assert.equal(autoReport.comparisonEnd, "2026-11-14");

  const histReport = generateHistoricalReport(repository, "custom", "2026-11-13", "2026-11-15");
  assert.equal(histReport.dailyPerformance.length, 3);
  assert.equal(histReport.dailyPerformance[1].date, "2026-11-14");
  assert.equal(histReport.dailyPerformance[1].totalRevenue, 0);
  assert.equal(repository.listAnalysisReports().length, 2);

  const pdfBuffer = await renderAnalysisReport({
    ...autoReport,
    availableMetrics: availableMetricsForMapping(mapping)
  });
  assert.ok(pdfBuffer.byteLength > 1000);
  assert.equal(pdfBuffer.subarray(0, 5).toString("ascii"), "%PDF-");
});

