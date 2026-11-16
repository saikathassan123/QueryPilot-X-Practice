import PDFDocument from "pdfkit";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AnalysisDimension, AnalysisReport, DailyPerformance } from "../types";

const REPORT_DIRECTORY = path.join(process.cwd(), ".local-data", "reports");
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const COLORS = {
  ink: "#20262d",
  muted: "#6d7782",
  green: "#279a6c",
  lightGreen: "#eff9f3",
  border: "#dce3e8",
  light: "#f6f8f9",
  red: "#a14949"
};

const money = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantity = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });
const percent = (value: number) => `${value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
const label = (value: string) => value.length > 34 ? `${value.slice(0, 31)}...` : value;
type RenderState = { pageNumber: number };
type StyledTextOptions = PDFKit.Mixins.TextOptions & { font?: string; fontSize?: number; fillColor?: string };

function safeFilenamePart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "report";
}

function reportFilename(report: AnalysisReport) {
  if (!report.id) throw new Error("A persisted report id is required.");
  return `querypilot-x-report-${report.id}-${safeFilenamePart(report.reportKind)}-${safeFilenamePart(report.periodStart)}-to-${safeFilenamePart(report.periodEnd)}.pdf`;
}

function reportPath(report: AnalysisReport) {
  return path.join(REPORT_DIRECTORY, reportFilename(report));
}

function drawHeader(document: PDFKit.PDFDocument, report: AnalysisReport, pageNumber: number) {
  document.fillColor(COLORS.green).rect(MARGIN, 30, 28, 28).fill();
  document.fillColor("#ffffff").font("Helvetica-Bold").fontSize(13).text("Q", MARGIN + 8, 36);
  document.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(13).text("QueryPilot X", MARGIN + 38, 36);
  document.fillColor(COLORS.muted).font("Helvetica").fontSize(8).text(`Business Performance Report · Page ${pageNumber}`, MARGIN, 61, { width: CONTENT_WIDTH, align: "right" });
  document.moveTo(MARGIN, 74).lineTo(PAGE_WIDTH - MARGIN, 74).strokeColor(COLORS.border).stroke();
  if (pageNumber > 1) document.y = 92;
}

function drawFooter(document: PDFKit.PDFDocument, pageNumber: number) {
  document.moveTo(MARGIN, PAGE_HEIGHT - 43).lineTo(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 43).strokeColor(COLORS.border).stroke();
  document.fillColor(COLORS.muted).font("Helvetica").fontSize(8).text("QueryPilot X · Generated from analyzed sales data", MARGIN, PAGE_HEIGHT - 31);
  document.text(`Page ${pageNumber}`, MARGIN, PAGE_HEIGHT - 31, { width: CONTENT_WIDTH, align: "right" });
}

function addText(document: PDFKit.PDFDocument, text: string, x: number, y: number, options: StyledTextOptions = {}) {
  const { fillColor, font, fontSize, ...textOptions } = options;
  document.fillColor(fillColor || COLORS.ink).font(font || "Helvetica").fontSize(fontSize || 9).text(text, x, y, textOptions);
}

function drawSectionTitle(document: PDFKit.PDFDocument, title: string, y: number) {
  addText(document, title, MARGIN, y, { font: "Helvetica-Bold", fontSize: 14 });
  document.moveTo(MARGIN, y + 20).lineTo(PAGE_WIDTH - MARGIN, y + 20).strokeColor(COLORS.green).lineWidth(1.5).stroke();
  return y + 34;
}

function drawKpis(document: PDFKit.PDFDocument, report: AnalysisReport, y: number) {
  const kpis: Array<[string, string]> = [
    ["Total Revenue", money(report.current.totalRevenue)],
    ["Total Orders", quantity(report.current.totalOrders)],
    ["Total Units Sold", quantity(report.current.totalUnitsSold)],
    ["Gross Profit", money(report.current.grossProfit)],
    ["Gross Profit Margin", percent(report.current.grossProfitMargin)],
    ["Average Order Value", money(report.current.averageOrderValue)],
    ["Total Discounts", money(report.current.totalDiscounts)],
    ["Average Customer Rating", report.current.averageCustomerRating === null ? "N/A" : quantity(report.current.averageCustomerRating)]
  ];
  const cellWidth = (CONTENT_WIDTH - 12) / 2;
  for (let index = 0; index < kpis.length; index += 2) {
    const rowY = y + Math.floor(index / 2) * 55;
    for (let column = 0; column < 2; column += 1) {
      const item = kpis[index + column];
      if (!item) continue;
      const x = MARGIN + column * (cellWidth + 12);
      document.roundedRect(x, rowY, cellWidth, 44, 5).fillColor(COLORS.light).fillAndStroke(COLORS.border);
      addText(document, item[0], x + 10, rowY + 8, { fontSize: 8, fillColor: COLORS.muted });
      addText(document, item[1], x + 10, rowY + 21, { font: "Helvetica-Bold", fontSize: 14 });
    }
  }
  return y + 4 * 55;
}

function drawLineChart(document: PDFKit.PDFDocument, title: string, values: DailyPerformance[], metric: "totalRevenue" | "totalOrders", format: (value: number) => string, y: number) {
  const chartHeight = 190;
  const chartTop = y + 25;
  const chartLeft = MARGIN + 38;
  const chartWidth = CONTENT_WIDTH - 48;
  const chartBottom = chartTop + chartHeight;
  addText(document, title, MARGIN, y, { font: "Helvetica-Bold", fontSize: 11 });
  document.roundedRect(MARGIN, chartTop, CONTENT_WIDTH, chartHeight, 5).fillColor("#ffffff").fillAndStroke(COLORS.border);
  if (!values.length) {
    addText(document, "No completed sales in this period.", MARGIN + 14, chartTop + 85, { fillColor: COLORS.muted });
    return chartBottom + 18;
  }
  const max = Math.max(...values.map(item => item[metric]), 1);
  for (let index = 0; index <= 4; index += 1) {
    const gridY = chartBottom - (index / 4) * chartHeight + 1;
    document.moveTo(chartLeft, gridY).lineTo(chartLeft + chartWidth, gridY).strokeColor("#edf1f3").lineWidth(0.5).stroke();
    addText(document, format((max / 4) * index), MARGIN + 4, gridY - 5, { fontSize: 7, fillColor: COLORS.muted });
  }
  const points = values.map((item, index) => {
    const x = values.length === 1 ? chartLeft + chartWidth / 2 : chartLeft + (index / (values.length - 1)) * chartWidth;
    const pointY = chartBottom - (item[metric] / max) * (chartHeight - 14);
    return { x, y: pointY, date: item.date };
  });
  document.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) document.lineTo(point.x, point.y);
  document.strokeColor(COLORS.green).lineWidth(2).stroke();
  for (const point of points) document.circle(point.x, point.y, 1.8).fillColor(COLORS.green).fill();
  const labelStep = Math.max(1, Math.ceil(values.length / 6));
  points.forEach((point, index) => {
    if (index % labelStep !== 0 && index !== points.length - 1) return;
    addText(document, point.date, point.x - 24, chartBottom + 7, { fontSize: 7, fillColor: COLORS.muted, width: 48, align: "center" });
  });
  return chartBottom + 28;
}

function nextPage(document: PDFKit.PDFDocument, report: AnalysisReport, state: RenderState) {
  drawFooter(document, state.pageNumber);
  document.addPage();
  state.pageNumber += 1;
  drawHeader(document, report, state.pageNumber);
}

function drawDimensionSection(document: PDFKit.PDFDocument, report: AnalysisReport, state: RenderState, title: string, items: AnalysisDimension[], y: number) {
  y = drawSectionTitle(document, title, y);
  if (!items.length) {
    addText(document, "No completed records in this period.", MARGIN, y, { fillColor: COLORS.muted });
    return y + 28;
  }
  const maxRevenue = Math.max(...items.map(item => item.revenue), 1);
  for (const item of items) {
    if (y > PAGE_HEIGHT - 85) {
      nextPage(document, report, state);
      y = 94;
      y = drawSectionTitle(document, `${title} (continued)`, y);
    }
    addText(document, label(item.label), MARGIN, y + 1, { fontSize: 8, width: 120 });
    document.roundedRect(MARGIN + 125, y, 220, 12, 3).fillColor(COLORS.light).fill();
    document.roundedRect(MARGIN + 125, y, Math.max((item.revenue / maxRevenue) * 220, 2), 12, 3).fillColor(COLORS.green).fill();
    addText(document, money(item.revenue), MARGIN + 355, y + 1, { fontSize: 8, width: 62, align: "right" });
    addText(document, `${quantity(item.orders)} orders · ${quantity(item.units)} units`, MARGIN + 425, y + 1, { fontSize: 7, fillColor: COLORS.muted, width: 74, align: "right" });
    y += 20;
  }
  return y + 10;
}

function drawStatusSection(document: PDFKit.PDFDocument, report: AnalysisReport, state: RenderState, y: number) {
  if (y > PAGE_HEIGHT - 180) {
    nextPage(document, report, state);
    y = 94;
  }
  y = drawSectionTitle(document, "Order Status Distribution", y);
  for (const [status, count] of Object.entries(report.current.statusDistribution)) {
    addText(document, status, MARGIN, y, { fontSize: 9, width: 150 });
    addText(document, quantity(count), MARGIN + 160, y, { font: "Helvetica-Bold", fontSize: 9 });
    y += 18;
  }
  return y + 8;
}

function drawInsights(document: PDFKit.PDFDocument, report: AnalysisReport, state: RenderState, y: number) {
  y = drawSectionTitle(document, "Growth, Decline and Business Insights", y);
  const insights: string[] = [];
  const comparison = report.comparisonDailyAverage;
  if (comparison && comparison.totalRevenue > 0) {
    const change = ((report.current.totalRevenue - comparison.totalRevenue) / comparison.totalRevenue) * 100;
    insights.push(`Revenue shows a ${change >= 0 ? "growth" : "decline"} of ${Math.abs(change).toFixed(1)}% versus the comparison daily average.`);
  } else {
    insights.push("No comparable revenue baseline is available for this report.");
  }
  const topProduct = report.productPerformance[0];
  const topCategory = report.categoryPerformance[0];
  const topRegion = report.regionPerformance[0];
  if (topProduct) insights.push(`${topProduct.label} is the highest-revenue product in the selected period (${money(topProduct.revenue)}).`);
  if (topCategory) insights.push(`${topCategory.label} is the highest-revenue category in the selected period (${money(topCategory.revenue)}).`);
  if (topRegion) insights.push(`${topRegion.label} is the highest-revenue region in the selected period (${money(topRegion.revenue)}).`);
  for (const insight of insights) {
    document.font("Helvetica").fontSize(9);
    const height = document.heightOfString(insight, { width: CONTENT_WIDTH - 24, lineGap: 2 }) + 16;
    if (y + height > PAGE_HEIGHT - 75) {
      nextPage(document, report, state);
      y = 94;
    }
    document.roundedRect(MARGIN, y, CONTENT_WIDTH, height, 4).fillColor(COLORS.lightGreen).fillAndStroke("#d5efdf");
    addText(document, `• ${insight}`, MARGIN + 12, y + 8, { fontSize: 9, width: CONTENT_WIDTH - 24, lineGap: 2 });
    y += height + 8;
  }
  return y + 8;
}

export async function renderAnalysisReport(report: AnalysisReport) {
  const state: RenderState = { pageNumber: 1 };
  const document = new PDFDocument({ size: "A4", margin: MARGIN, autoFirstPage: false, info: { Title: "QueryPilot X - Business Performance Report", Author: "QueryPilot X" } });
  const chunks: Buffer[] = [];
  document.on("data", chunk => chunks.push(Buffer.from(chunk)));
  const finished = new Promise<Buffer>((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  document.addPage();
  drawHeader(document, report, state.pageNumber);
  let y = 104;
  addText(document, "QueryPilot X", MARGIN, y, { font: "Helvetica-Bold", fontSize: 24 });
  addText(document, "Business Performance Report", MARGIN, y + 31, { font: "Helvetica", fontSize: 15, fillColor: COLORS.green });
  addText(document, `Generated ${new Date(report.generatedAt).toLocaleString("en-US")}`, MARGIN, y + 58, { fontSize: 9, fillColor: COLORS.muted });
  addText(document, `Reporting period: ${report.periodStart} to ${report.periodEnd}`, MARGIN, y + 76, { fontSize: 9 });
  addText(document, report.comparisonStart && report.comparisonEnd
    ? `Comparison period: ${report.comparisonStart} to ${report.comparisonEnd} (${report.comparisonDays} days)`
    : "Comparison period: Not applicable", MARGIN, y + 92, { fontSize: 9 });

  y += 132;
  y = drawSectionTitle(document, "Executive Summary", y);
  addText(document, "This report summarizes completed sales performance. Order status distribution includes all recorded statuses.", MARGIN, y, { fontSize: 9, fillColor: COLORS.muted, width: CONTENT_WIDTH });
  y += 28;
  y = drawKpis(document, report, y) + 15;
  y = drawLineChart(document, "Revenue Trend", report.dailyPerformance, "totalRevenue", money, y);
  if (y > PAGE_HEIGHT - 280) {
    nextPage(document, report, state);
    y = 94;
  }
  y = drawLineChart(document, "Order Trend", report.dailyPerformance, "totalOrders", quantity, y);
  y += 8;
  y = drawDimensionSection(document, report, state, "Product Performance", report.productPerformance, y);
  y = drawDimensionSection(document, report, state, "Category Analysis", report.categoryPerformance, y);
  y = drawDimensionSection(document, report, state, "Regional Performance", report.regionPerformance, y);
  y = drawDimensionSection(document, report, state, "Gender-wise Performance", report.genderPerformance, y);
  y = drawStatusSection(document, report, state, y);
  y = drawInsights(document, report, state, y);
  if (y > PAGE_HEIGHT - 210) {
    nextPage(document, report, state);
    y = 94;
  }
  y = drawSectionTitle(document, "Calculation Notes and Assumptions", y);
  const notes = [
    "Revenue, profit, discounts, units, orders, ratings and margin KPIs use the existing AnalysisReport values.",
    "Only Completed sales contribute to financial KPI calculations.",
    "Order status distribution includes all applicable statuses, including zero-count statuses.",
    "Growth or decline compares current revenue with the existing comparison daily average revenue when available.",
    "Values marked N/A indicate that the source report did not contain a value."
  ];
  for (const note of notes) {
    addText(document, `• ${note}`, MARGIN, y, { fontSize: 9, width: CONTENT_WIDTH, lineGap: 3 });
    y += 20;
  }
  drawFooter(document, state.pageNumber);
  document.end();
  return finished;
}

export async function saveAnalysisReportPdf(report: AnalysisReport) {
  if (!report.id) throw new Error("A persisted report id is required.");
  await mkdir(REPORT_DIRECTORY, { recursive: true });
  const filePath = reportPath(report);
  try {
    const existing = await stat(filePath);
    if (existing.size > 0) return { filename: reportFilename(report), filePath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const pdf = await renderAnalysisReport(report);
  try {
    await writeFile(filePath, pdf, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return { filename: reportFilename(report), filePath };
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
