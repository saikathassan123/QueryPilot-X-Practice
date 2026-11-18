import PDFDocument from "pdfkit";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AnalysisKpis, AnalysisReport, DailyPerformance } from "../types";

function reportDirectory() {
  return process.env.QUERYPILOT_REPORT_DIRECTORY || path.join(process.cwd(), "Generated PDFs");
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CONTENT_TOP = 94;
const COLORS = {
  ink: "#20262d",
  muted: "#6d7782",
  green: "#279a6c",
  lightGreen: "#eff9f3",
  border: "#dce3e8",
  light: "#f6f8f9",
  red: "#a14949",
  amber: "#b7791f"
};

const money = (value: number) => `BDT ${safeNumber(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const quantity = (value: number) => safeNumber(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
const percent = (value: number) => `${safeNumber(value).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
const safeNumber = (value: number) => Number.isFinite(value) ? value : 0;
const dateValue = (value: string) => new Date(`${value}T00:00:00Z`);
const dateLabel = (value: string) => value.slice(5);
type RenderState = { pageNumber: number };
type StyledTextOptions = PDFKit.Mixins.TextOptions & { font?: string; fontSize?: number; fillColor?: string };
type KpiKey = "totalRevenue" | "totalOrders" | "totalUnitsSold" | "grossProfit" | "grossProfitMargin" | "averageOrderValue";
type ChartMetric = { key: KpiKey; title: string; axisLabel: string; format: (value: number) => string; type: "line" | "bar"; color: string };
type ChartPoint = { label: string; value: number; current: boolean };

function safeFilenamePart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "report";
}

function reportFilename(report: AnalysisReport) {
  if (!report.id) throw new Error("A persisted report id is required.");
  return `querypilot-x-report-${report.id}-${safeFilenamePart(report.reportKind)}-${safeFilenamePart(report.periodStart)}-to-${safeFilenamePart(report.periodEnd)}.pdf`;
}

function reportPath(report: AnalysisReport) {
  return path.join(reportDirectory(), reportFilename(report));
}

function addText(document: PDFKit.PDFDocument, text: string, x: number, y: number, options: StyledTextOptions = {}) {
  const { fillColor, font, fontSize, ...textOptions } = options;
  document.fillColor(fillColor || COLORS.ink).font(font || "Helvetica").fontSize(fontSize || 9).text(text, x, y, textOptions);
}

function drawHeader(document: PDFKit.PDFDocument, report: AnalysisReport, pageNumber: number) {
  document.fillColor(COLORS.green).rect(MARGIN, 30, 28, 28).fill();
  addText(document, "Q", MARGIN + 8, 36, { font: "Helvetica-Bold", fontSize: 13, fillColor: "#ffffff" });
  addText(document, "QueryPilot X", MARGIN + 38, 36, { font: "Helvetica-Bold", fontSize: 13 });
  addText(document, `Business Performance Report · ${report.reportingDate}`, MARGIN, 61, {
    fontSize: 8,
    fillColor: COLORS.muted,
    width: CONTENT_WIDTH,
    align: "right"
  });
  document.moveTo(MARGIN, 74).lineTo(PAGE_WIDTH - MARGIN, 74).strokeColor(COLORS.border).stroke();
}

function drawFooter(document: PDFKit.PDFDocument, pageNumber: number) {
  document.moveTo(MARGIN, PAGE_HEIGHT - 63).lineTo(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 63).strokeColor(COLORS.border).stroke();
  addText(document, "QueryPilot X · Aggregated sales performance", MARGIN, PAGE_HEIGHT - 58, { fontSize: 8, fillColor: COLORS.muted });
  addText(document, `Page ${pageNumber}`, MARGIN, PAGE_HEIGHT - 58, { fontSize: 8, fillColor: COLORS.muted, width: CONTENT_WIDTH, align: "right" });
}

function drawSectionTitle(document: PDFKit.PDFDocument, title: string, y: number, fontSize = 13) {
  addText(document, title, MARGIN, y, { font: "Helvetica-Bold", fontSize });
  document.moveTo(MARGIN, y + 19).lineTo(PAGE_WIDTH - MARGIN, y + 19).strokeColor(COLORS.green).lineWidth(1.3).stroke();
  return y + 30;
}

function dateSpan(start: string, end: string) {
  return Math.max(1, Math.round((dateValue(end).getTime() - dateValue(start).getTime()) / 86400000) + 1);
}

function metricValue(kpis: AnalysisKpis, key: KpiKey) {
  return safeNumber(kpis[key]);
}

function normalizedValue(report: AnalysisReport, kpis: AnalysisKpis, key: KpiKey) {
  const days = dateSpan(report.periodStart, report.periodEnd);
  if (key === "grossProfitMargin") return metricValue(kpis, key);
  if (key === "averageOrderValue") return metricValue(kpis, key);
  return metricValue(kpis, key) / days;
}

function comparisonDelta(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function kpiFormat(key: KpiKey, value: number) {
  if (key === "totalRevenue" || key === "grossProfit" || key === "averageOrderValue") return money(value);
  if (key === "grossProfitMargin") return percent(value);
  return quantity(value);
}

function kpiDefinitions(): Array<{ key: KpiKey; name: string; positive: "higher" | "lower" }> {
  return [
    { key: "totalRevenue", name: "Total Revenue", positive: "higher" },
    { key: "totalOrders", name: "Total Orders", positive: "higher" },
    { key: "totalUnitsSold", name: "Total Units Sold", positive: "higher" },
    { key: "grossProfit", name: "Gross Profit", positive: "higher" },
    { key: "grossProfitMargin", name: "Gross Profit Margin", positive: "higher" },
    { key: "averageOrderValue", name: "Average Order Value", positive: "higher" }
  ];
}

function isMetricAvailable(report: AnalysisReport, key: KpiKey) {
  return !report.availableMetrics || report.availableMetrics.includes(key);
}

function drawKpiCards(document: PDFKit.PDFDocument, report: AnalysisReport, y: number) {
  const definitions = kpiDefinitions();
  const cellWidth = (CONTENT_WIDTH - 12) / 2;
  const cellHeight = 68;
  const previous = report.comparisonDailyAverage;
  for (let index = 0; index < definitions.length; index += 2) {
    const rowY = y + Math.floor(index / 2) * 76;
    for (let column = 0; column < 2; column += 1) {
      const definition = definitions[index + column];
      if (!definition) continue;
      const x = MARGIN + column * (cellWidth + 12);
      const available = isMetricAvailable(report, definition.key);
      const current = metricValue(report.current, definition.key);
      const previousValue = available && previous ? metricValue(previous, definition.key) : null;
      const delta = !available || previousValue === null ? null : comparisonDelta(normalizedValue(report, report.current, definition.key), previousValue);
      const indicatorColor = delta === null ? COLORS.muted : delta > 0 ? COLORS.green : delta < 0 ? COLORS.red : COLORS.muted;
      const indicator = !available ? "Column not mapped" : delta === null ? "No comparison" : delta > 0 ? `▲ ${Math.abs(delta).toFixed(1)}%` : delta < 0 ? `▼ ${Math.abs(delta).toFixed(1)}%` : "• 0.0%";
      document.roundedRect(x, rowY, cellWidth, cellHeight, 6).fillColor(COLORS.light).fillAndStroke(COLORS.border);
      addText(document, definition.name, x + 11, rowY + 9, { fontSize: 8, fillColor: COLORS.muted });
      addText(document, available ? kpiFormat(definition.key, current) : "Unavailable", x + 11, rowY + 24, { font: "Helvetica-Bold", fontSize: 14 });
      addText(document, indicator, x + 11, rowY + 47, { font: "Helvetica-Bold", fontSize: 8, fillColor: indicatorColor });
      if (available && previousValue !== null) {
        addText(document, `Prev daily avg: ${kpiFormat(definition.key, previousValue)}`, x + 105, rowY + 48, { fontSize: 6.5, fillColor: COLORS.muted, width: cellWidth - 116, align: "right" });
      }
    }
  }
  return y + 3 * 76;
}

function aggregatePerformance(values: DailyPerformance[], start: string, end: string) {
  if (values.length <= 14) return values;
  const days = dateSpan(start, end);
  const mode = days <= 90 ? "week" : "month";
  const buckets = new Map<string, DailyPerformance[]>();
  for (const value of values) {
    const date = dateValue(value.date);
    let bucket = value.date;
    if (mode === "week") {
      const day = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() - day + 1);
      bucket = date.toISOString().slice(0, 10);
    } else {
      bucket = value.date.slice(0, 7);
    }
    const entries = buckets.get(bucket) || [];
    entries.push(value);
    buckets.set(bucket, entries);
  }
  return [...buckets.entries()].map(([bucket, entries]) => {
    const sum = entries.reduce((result, item) => ({
      revenue: result.revenue + safeNumber(item.totalRevenue),
      orders: result.orders + safeNumber(item.totalOrders),
      units: result.units + safeNumber(item.totalUnitsSold),
      lines: result.lines + safeNumber(item.totalProductLines),
      profit: result.profit + safeNumber(item.grossProfit),
      discounts: result.discounts + safeNumber(item.totalDiscounts)
    }), { revenue: 0, orders: 0, units: 0, lines: 0, profit: 0, discounts: 0 });
    const rated = entries.filter(item => item.averageCustomerRating !== null);
    const revenue = sum.revenue;
    return {
      date: bucket,
      totalRevenue: revenue,
      totalOrders: sum.orders,
      totalUnitsSold: sum.units,
      totalProductLines: sum.lines,
      grossProfit: sum.profit,
      grossProfitMargin: revenue ? (sum.profit / revenue) * 100 : 0,
      totalDiscounts: sum.discounts,
      averageOrderValue: sum.orders ? revenue / sum.orders : 0,
      averageCustomerRating: rated.length ? rated.reduce((total, item) => total + safeNumber(item.averageCustomerRating as number), 0) / rated.length : null
    };
  });
}

function chartPoints(report: AnalysisReport, metric: ChartMetric) {
  const values = aggregatePerformance(report.dailyPerformance, report.periodStart, report.periodEnd);
  if (values.length > 1) {
    return values.map(item => ({ label: item.date, value: safeNumber(item[metric.key]), current: true }));
  }
  const previous = report.comparisonDailyAverage ? metricValue(report.comparisonDailyAverage, metric.key) : null;
  const current = values[0] ? safeNumber(values[0][metric.key]) : 0;
  if (previous !== null) {
    return [
      { label: "Previous avg", value: previous, current: false },
      { label: "Current", value: current, current: true }
    ];
  }
  return values.map(item => ({ label: item.date, value: safeNumber(item[metric.key]), current: true }));
}

function drawChart(document: PDFKit.PDFDocument, metric: ChartMetric, points: ChartPoint[], y: number, periodLabel: string) {
  const chartHeight = 178;
  const chartTop = y + 23;
  const chartLeft = MARGIN + 48;
  const chartWidth = CONTENT_WIDTH - 64;
  const plotTop = chartTop + 27;
  const plotBottom = chartTop + 137;
  const plotHeight = plotBottom - plotTop;
  addText(document, metric.title, MARGIN, y, { font: "Helvetica-Bold", fontSize: 11 });
  document.roundedRect(MARGIN, chartTop, CONTENT_WIDTH, chartHeight, 5).fillColor("#ffffff").fillAndStroke(COLORS.border);
  addText(document, metric.axisLabel, MARGIN + 8, chartTop + 53, { fontSize: 6.5, fillColor: COLORS.muted });
  addText(document, "Date / period", chartLeft + chartWidth / 2 - 30, chartTop + 158, { fontSize: 6.5, fillColor: COLORS.muted, width: 60, align: "center" });
  addText(document, `Period: ${periodLabel}`, chartLeft + chartWidth - 112, chartTop + 8, { fontSize: 6.5, fillColor: COLORS.muted, width: 104, align: "right" });
  if (!points.length) {
    addText(document, "Insufficient data for this period.", MARGIN + 16, chartTop + 85, { fontSize: 9, fillColor: COLORS.muted });
    return chartTop + chartHeight + 14;
  }
  const numbers = points.map(item => Math.max(0, safeNumber(item.value)));
  const maxValue = Math.max(...numbers, 1);
  const scaleMax = maxValue === 1 && numbers.every(value => value === 0) ? 1 : maxValue * 1.15;
  for (let index = 0; index <= 4; index += 1) {
    const gridY = plotBottom - (index / 4) * plotHeight;
    document.moveTo(chartLeft, gridY).lineTo(chartLeft + chartWidth, gridY).strokeColor("#edf1f3").lineWidth(0.5).stroke();
    addText(document, metric.format((scaleMax / 4) * index), MARGIN + 4, gridY - 4, { fontSize: 6.5, fillColor: COLORS.muted, width: 40, align: "right" });
  }
  const plotted = points.map((item, index) => ({
    x: points.length === 1 ? chartLeft + chartWidth / 2 : chartLeft + (index / (points.length - 1)) * chartWidth,
    y: plotBottom - (numbers[index] / scaleMax) * plotHeight,
    value: numbers[index],
    label: item.label,
    current: item.current
  }));
  if (metric.type === "bar") {
    const barWidth = Math.max(8, Math.min(28, chartWidth / plotted.length - 6));
    plotted.forEach(point => {
      const height = Math.max(point.value ? 2 : 1, (point.value / scaleMax) * plotHeight);
      document.roundedRect(point.x - barWidth / 2, plotBottom - height, barWidth, height, 2).fillColor(point.current ? metric.color : COLORS.muted).fill();
    });
  } else {
    document.moveTo(plotted[0].x, plotted[0].y);
    for (const point of plotted.slice(1)) document.lineTo(point.x, point.y);
    document.strokeColor(metric.color).lineWidth(2).stroke();
    plotted.forEach(point => document.circle(point.x, point.y, 2.8).fillColor(point.current ? metric.color : COLORS.muted).fill());
  }
  if (plotted.some(point => !point.current)) {
    document.circle(chartLeft + 5, chartTop + 11, 3).fillColor(COLORS.muted).fill();
    addText(document, "Previous daily average", chartLeft + 12, chartTop + 7, { fontSize: 6.5, fillColor: COLORS.muted });
    document.circle(chartLeft + 92, chartTop + 11, 3).fillColor(metric.color).fill();
    addText(document, "Current period", chartLeft + 99, chartTop + 7, { fontSize: 6.5, fillColor: metric.color });
  }
  const labelStep = Math.max(1, Math.ceil(plotted.length / 6));
  plotted.forEach((point, index) => {
    if (index % labelStep !== 0 && index !== plotted.length - 1) return;
    addText(document, metric.format(point.value), point.x - 25, point.y - 15, { font: "Helvetica-Bold", fontSize: 6.5, width: 50, align: "center" });
    addText(document, point.label, point.x - 35, plotBottom + 6, { fontSize: 6.5, fillColor: point.current ? COLORS.ink : COLORS.muted, width: 70, align: "center" });
  });
  return chartTop + chartHeight + 14;
}

function validCategoryBreakdown(report: AnalysisReport) {
  const items = report.categoryPerformance.filter(item => safeNumber(item.revenue) > 0);
  const total = items.reduce((sum, item) => sum + safeNumber(item.revenue), 0);
  return total > 0 ? { items, total } : null;
}

function drawCategoryDonut(document: PDFKit.PDFDocument, report: AnalysisReport, y: number) {
  const breakdown = validCategoryBreakdown(report);
  if (!breakdown) return;
  y = drawSectionTitle(document, "Revenue Mix by Category", y);
  const items = breakdown.items.length > 8
    ? [
        ...breakdown.items.slice(0, 7),
        { label: "Other", revenue: breakdown.items.slice(7).reduce((sum, item) => sum + safeNumber(item.revenue), 0) }
      ]
    : breakdown.items;
  const centerX = MARGIN + 130;
  const centerY = y + 105;
  const radius = 78;
  const colors = [COLORS.green, "#3d78b8", "#8a62b5", "#d17832", "#b24c72", "#2d8a8a", "#6e7a8a", "#9ea6b2"];
  let startAngle = -Math.PI / 2;
  items.forEach((item, index) => {
    const ratio = safeNumber(item.revenue) / breakdown.total;
    const endAngle = startAngle + ratio * Math.PI * 2;
    const points: Array<[number, number]> = [[centerX, centerY]];
    for (let step = 0; step <= 16; step += 1) {
      const angle = startAngle + (endAngle - startAngle) * (step / 16);
      points.push([centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius]);
    }
    document.moveTo(points[0][0], points[0][1]);
    for (const point of points.slice(1)) document.lineTo(point[0], point[1]);
    document.closePath().fillColor(colors[index % colors.length]).fill();
    startAngle = endAngle;
  });
  document.circle(centerX, centerY, 38).fillColor("#ffffff").fill();
  addText(document, "Revenue", centerX - 30, centerY - 5, { font: "Helvetica-Bold", fontSize: 8, width: 60, align: "center", lineBreak: false });
  addText(document, "mix", centerX - 30, centerY + 7, { fontSize: 7, fillColor: COLORS.muted, width: 60, align: "center", lineBreak: false });
  const legendX = MARGIN + 245;
  items.forEach((item, index) => {
    const ratio = safeNumber(item.revenue) / breakdown.total;
    const rowY = y + index * 25;
    document.roundedRect(legendX, rowY + 3, 9, 9, 2).fillColor(colors[index % colors.length]).fill();
    addText(document, item.label, legendX + 16, rowY, { fontSize: 8, width: 122, lineBreak: false, ellipsis: true });
    addText(document, `${(ratio * 100).toFixed(1)}%`, legendX + 142, rowY, { font: "Helvetica-Bold", fontSize: 8, width: 42, align: "right", lineBreak: false });
    addText(document, money(item.revenue), legendX + 188, rowY, { fontSize: 7, fillColor: COLORS.muted, width: 66, align: "right", lineBreak: false });
  });
}

function drawComparisonTable(document: PDFKit.PDFDocument, report: AnalysisReport, y: number) {
  y = drawSectionTitle(document, "Current vs Previous Period", y);
  const previous = report.comparisonDailyAverage;
  addText(document, `Current: ${report.periodStart} to ${report.periodEnd}`, MARGIN, y, { font: "Helvetica-Bold", fontSize: 8, width: 220 });
  addText(document, previous ? `Previous daily average: ${report.comparisonStart || "N/A"} to ${report.comparisonEnd || "N/A"}` : "Previous period comparison is not available.", MARGIN + 225, y, { fontSize: 8, fillColor: COLORS.muted, width: 275 });
  y += 22;
  const columns = [MARGIN, MARGIN + 158, MARGIN + 310, MARGIN + 412];
  document.roundedRect(MARGIN, y, CONTENT_WIDTH, 22, 3).fillColor(COLORS.light).fill();
  ["KPI", "Current", "Previous daily avg", "Change"].forEach((value, index) => addText(document, value, columns[index], y + 7, { font: "Helvetica-Bold", fontSize: 7.5, fillColor: COLORS.muted, width: index === 0 ? 145 : 95, align: index === 0 ? "left" : "right" }));
  y += 27;
  for (const definition of kpiDefinitions()) {
    const available = isMetricAvailable(report, definition.key);
    const current = metricValue(report.current, definition.key);
    const previousValue = available && previous ? metricValue(previous, definition.key) : null;
    const delta = !available || previousValue === null ? null : comparisonDelta(normalizedValue(report, report.current, definition.key), previousValue);
    addText(document, definition.name, columns[0], y + 3, { fontSize: 8, width: 145 });
    addText(document, available ? kpiFormat(definition.key, current) : "Unavailable", columns[1], y + 3, { fontSize: 8, width: 95, align: "right" });
    addText(document, previousValue === null ? "N/A" : kpiFormat(definition.key, previousValue), columns[2], y + 3, { fontSize: 8, fillColor: COLORS.muted, width: 95, align: "right" });
    addText(document, delta === null ? "N/A" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`, columns[3], y + 3, { font: "Helvetica-Bold", fontSize: 8, fillColor: delta === null ? COLORS.muted : delta >= 0 ? COLORS.green : COLORS.red, width: 86, align: "right" });
    document.moveTo(MARGIN, y + 19).lineTo(PAGE_WIDTH - MARGIN, y + 19).strokeColor(COLORS.border).lineWidth(0.5).stroke();
    y += 26;
  }
  return y + 8;
}

function drawInsights(document: PDFKit.PDFDocument, report: AnalysisReport, y: number) {
  y = drawSectionTitle(document, "Key Business Insights", y);
  const insights: string[] = [];
  const revenueChange = report.comparisonDailyAverage
    ? comparisonDelta(normalizedValue(report, report.current, "totalRevenue"), metricValue(report.comparisonDailyAverage, "totalRevenue"))
    : null;
  if (revenueChange === null) insights.push("A previous-period revenue baseline is not available for a mathematically valid comparison.");
  else insights.push(`Revenue is ${revenueChange >= 0 ? "up" : "down"} ${Math.abs(revenueChange).toFixed(1)}% versus the previous daily average.`);
  if (report.current.totalRevenue === 0) insights.push("No revenue was recorded in the reporting period; trend charts show the available zero value without fabricating data.");
  if (report.current.grossProfitMargin < 0) insights.push("Gross profit is negative for this period and should be reviewed against pricing and cost inputs.");
  else if (report.current.grossProfitMargin > 0) insights.push(`Gross profit margin is ${percent(report.current.grossProfitMargin)} for the reporting period.`);
  for (const insight of insights) {
    const height = document.heightOfString(`• ${insight}`, { width: CONTENT_WIDTH - 24, lineGap: 2 }) + 14;
    document.roundedRect(MARGIN, y, CONTENT_WIDTH, height, 4).fillColor(COLORS.lightGreen).fillAndStroke("#d5efdf");
    addText(document, `• ${insight}`, MARGIN + 12, y + 7, { fontSize: 8.5, width: CONTENT_WIDTH - 24, lineGap: 2 });
    y += height + 6;
  }
  return y;
}

function drawNotes(document: PDFKit.PDFDocument, y: number) {
  y = drawSectionTitle(document, "Calculation Notes and Assumptions", y);
  const notes = [
    "KPI values are taken from the existing AnalysisReport and authoritative sales repository calculations.",
    "Previous-period comparisons use daily averages when the current and comparison periods have different durations.",
    "Trend charts use daily data for short periods, weekly buckets for medium periods, and monthly buckets for long periods.",
    "A percentage change is shown only when the previous baseline is non-zero and mathematically valid.",
    "This report contains aggregated business metrics only; personal and order-level details are intentionally excluded."
  ];
  for (const note of notes) {
    const text = `• ${note}`;
    addText(document, text, MARGIN, y, { fontSize: 8.5, width: CONTENT_WIDTH, lineGap: 2 });
    y += document.heightOfString(text, { width: CONTENT_WIDTH, lineGap: 2 }) + 6;
  }
}

export async function renderAnalysisReport(report: AnalysisReport) {
  const state: RenderState = { pageNumber: 1 };
  const document = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    autoFirstPage: false,
    info: { Title: "QueryPilot X - Aggregated Business Performance Report", Author: "QueryPilot X" }
  });
  const chunks: Buffer[] = [];
  document.on("data", chunk => chunks.push(Buffer.from(chunk)));
  const finished = new Promise<Buffer>((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });
  const periodLabel = `${report.periodStart} to ${report.periodEnd}`;
  const charts: ChartMetric[] = [
    { key: "totalRevenue", title: "Revenue Trend", axisLabel: "Revenue (BDT)", format: money, type: "line", color: COLORS.green },
    { key: "totalOrders", title: "Orders Trend", axisLabel: "Orders (count)", format: quantity, type: "bar", color: "#3d78b8" },
    { key: "totalUnitsSold", title: "Units Sold Trend", axisLabel: "Units (quantity)", format: quantity, type: "bar", color: "#8a62b5" },
    { key: "grossProfit", title: "Gross Profit Trend", axisLabel: "Gross profit (BDT)", format: money, type: "line", color: "#279a6c" },
    { key: "grossProfitMargin", title: "Gross Profit Margin Trend", axisLabel: "Margin (%)", format: percent, type: "line", color: "#d17832" },
    { key: "averageOrderValue", title: "Average Order Value Trend", axisLabel: "Average Order Value (BDT)", format: money, type: "line", color: "#b24c72" }
  ];

  document.addPage();
  drawHeader(document, report, state.pageNumber);
  let y = CONTENT_TOP;
  addText(document, "QueryPilot X", MARGIN, y, { font: "Helvetica-Bold", fontSize: 23 });
  addText(document, "Business Performance Report", MARGIN, y + 28, { fontSize: 14, fillColor: COLORS.green });
  addText(document, `Reporting period: ${periodLabel}`, MARGIN, y + 52, { fontSize: 8.5 });
  addText(document, report.comparisonStart && report.comparisonEnd
    ? `Previous period: ${report.comparisonStart} to ${report.comparisonEnd} · comparisons normalized per day`
    : "Previous-period comparison: Not available", MARGIN, y + 67, { fontSize: 8.5 });
  y += 94;
  y = drawSectionTitle(document, "Executive Summary", y);
  addText(document, "This report presents six aggregated business performance indicators and their data-driven trends.", MARGIN, y, { fontSize: 8.5, fillColor: COLORS.muted, width: CONTENT_WIDTH });
  y += 25;
  drawKpiCards(document, report, y);
  drawFooter(document, state.pageNumber);

  document.addPage();
  state.pageNumber += 1;
  drawHeader(document, report, state.pageNumber);
  y = CONTENT_TOP;
  y = drawSectionTitle(document, "Revenue, Orders and Units", y);
  y = drawChart(document, charts[0], chartPoints(report, charts[0]), y, periodLabel);
  y = drawChart(document, charts[1], chartPoints(report, charts[1]), y + 6, periodLabel);
  drawChart(document, charts[2], chartPoints(report, charts[2]), y + 6, periodLabel);
  drawFooter(document, state.pageNumber);

  document.addPage();
  state.pageNumber += 1;
  drawHeader(document, report, state.pageNumber);
  y = CONTENT_TOP;
  y = drawSectionTitle(document, "Profitability and Order Value", y);
  y = drawChart(document, charts[3], chartPoints(report, charts[3]), y, periodLabel);
  y = drawChart(document, charts[4], chartPoints(report, charts[4]), y + 6, periodLabel);
  drawChart(document, charts[5], chartPoints(report, charts[5]), y + 6, periodLabel);
  drawFooter(document, state.pageNumber);

  document.addPage();
  state.pageNumber += 1;
  drawHeader(document, report, state.pageNumber);
  y = CONTENT_TOP;
  y = drawComparisonTable(document, report, y);
  y += 18;
  y = drawInsights(document, report, y);
  drawNotes(document, Math.max(y + 12, 590));
  drawFooter(document, state.pageNumber);

  if (validCategoryBreakdown(report)) {
    document.addPage();
    state.pageNumber += 1;
    drawHeader(document, report, state.pageNumber);
    drawCategoryDonut(document, report, CONTENT_TOP);
    drawFooter(document, state.pageNumber);
  }

  document.end();
  return finished;
}

export async function saveAnalysisReportPdf(report: AnalysisReport) {
  if (!report.id) throw new Error("A persisted report id is required.");
  await mkdir(reportDirectory(), { recursive: true });
  const filePath = reportPath(report);
  try {
    const existing = await stat(filePath);
    if (existing.size > 0) return { filename: reportFilename(report), filePath, sizeBytes: existing.size };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const pdf = await renderAnalysisReport(report);
  try {
    await writeFile(filePath, pdf, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return { filename: reportFilename(report), filePath, sizeBytes: pdf.byteLength };
}

export async function readAnalysisReportPdf(report: AnalysisReport) {
  const filePath = reportPath(report);
  try {
    return await readFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
