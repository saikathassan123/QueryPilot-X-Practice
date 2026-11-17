"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, CalendarDays, Database, DollarSign, Download, RefreshCw, Settings, ShieldCheck, Star, TrendingUp, type LucideIcon } from "lucide-react";
import type { AnalysisDimension, AnalysisReport } from "../types";
import type { AnalysisSettings } from "../settings";
import { detectDatasetColumns, type DatasetMapping } from "../database/dataset-mapping";
import type { Table } from "../../src/lib/database";

type Props = { onBack: () => void };
const mappingFields = [
  ["orderId", "Order ID"], ["orderDate", "Order date"], ["product", "Product"], ["category", "Category"],
  ["quantity", "Quantity"], ["revenue", "Revenue / price"], ["cost", "Cost"], ["profit", "Profit"], ["discount", "Discount"],
  ["status", "Order status"], ["gender", "Customer gender"], ["region", "Region"], ["rating", "Customer rating"]
] as const;
const money = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const number = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });
const displayMetric = (report: AnalysisReport, key: string, value: string) => !report.availableMetrics || report.availableMetrics.includes(key) ? value : "Unavailable";

function MiniBars({ title, items, valueKey }: { title: string; items: AnalysisDimension[]; valueKey: "revenue" | "orders" | "units" }) {
  const max = Math.max(...items.map(item => item[valueKey]), 1);
  return <section className="analysis-card chart-card"><h2>{title}</h2>{items.length ? items.slice(0, 8).map(item => (
    <div className="bar-row" key={item.label}><span title={item.label}>{item.label}</span><div><i style={{ width: `${Math.max((item[valueKey] / max) * 100, 2)}%` }}/></div><b>{valueKey === "revenue" ? money(item[valueKey]) : number(item[valueKey])}</b></div>
  )) : <p className="analysis-empty">No completed records in this period.</p>}</section>;
}

function Trend({ report, metric, title, format }: {
  report: AnalysisReport;
  metric: "totalRevenue" | "totalOrders" | "grossProfit";
  title: string;
  format: (value: number) => string;
}) {
  const available = !report.availableMetrics || report.availableMetrics.includes(metric);
  const values = report.dailyPerformance;
  const max = Math.max(...values.map(item => item[metric]), 1);
  const points = values.map((item, index) => `${values.length === 1 ? 50 : (index / (values.length - 1)) * 100},${100 - (item[metric] / max) * 90}`).join(" ");
  return <section className="analysis-card trend-card"><div className="card-title"><h2>{title}</h2><span>{report.periodStart} to {report.periodEnd}</span></div>{!available ? <p className="analysis-empty">Column not mapped in selected table.</p> : values.length ? <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={title}><polyline points={points}/></svg> : <p className="analysis-empty">No completed sales.</p>}<div className="trend-labels"><span>{title}</span><strong>{available ? format(report.current[metric]) : "Unavailable"}</strong></div></section>;
}

export default function DailyAnalysisDashboard({ onBack }: Props) {
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [history, setHistory] = useState<AnalysisReport[]>([]);
  const [comparisonDays, setComparisonDays] = useState("30");
  const [customDays, setCustomDays] = useState("30");
  const [range, setRange] = useState("week");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pdfBusyId, setPdfBusyId] = useState<number | null>(null);
  const [pdfMessage, setPdfMessage] = useState("");
  const [settings, setSettings] = useState<AnalysisSettings>({ comparisonDays: 30, timezone: "Asia/Dhaka", dailyReportEnabled: false, notificationEnabled: false, scheduledTime: "00:15" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [tables, setTables] = useState<Table[]>([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});

  async function loadHistory() {
    try { setHistory(JSON.parse(localStorage.getItem("querypilot.dailyReports") || "[]")); } catch { setHistory([]); }
  }

  async function loadTables() {
    const response = await fetch("/api/tables", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load Supabase tables.");
    const availableTables = (data.tables || []) as Table[];
    setTables(availableTables);
    if (!availableTables.length) {
      setError("No readable public tables were found in the connected Supabase project.");
      return;
    }
    const saved = localStorage.getItem("querypilot.dailyDataset");
    let selected: { table?: string; mapping?: Record<string, string> } = {};
    if (saved) try { selected = JSON.parse(saved); } catch { selected = {}; }
    const table = availableTables.find(item => item.name === selected.table)
      || availableTables.find(item => item.name === "daily_sales_orders")
      || availableTables.find(item => {
        const detected = detectDatasetColumns(item);
        return Boolean(detected.orderId && detected.orderDate);
      })
      || availableTables[0];
    if (table) {
      setSelectedTable(table.name);
      if (selected.table === table.name && selected.mapping) {
        const validMapping = Object.fromEntries(
          Object.entries(selected.mapping).filter(([, col]) => typeof col === "string" && table.columns.includes(col))
        );
        setMapping(validMapping);
      } else {
        setMapping({});
      }
    }
  }

  async function saveSettings() {
    setSettingsBusy(true); setSettingsMessage(""); setError("");
    try {
      localStorage.setItem("querypilot.dailySettings", JSON.stringify(settings));
      setComparisonDays(["7", "15", "30", "90", "365"].includes(String(settings.comparisonDays)) ? String(settings.comparisonDays) : "custom");
      setCustomDays(String(settings.comparisonDays));
      setSettingsMessage("Settings saved in this browser.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save report settings.");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function generate(body: Record<string, unknown> = {}) {
    setBusy(true); setError("");
    try {
      if (!selectedTable) throw new Error("Select a Supabase table before generating a report.");
      const dataset = { table: selectedTable, mapping };
      localStorage.setItem("querypilot.dailyDataset", JSON.stringify(dataset));
      const payload = body.kind === "historical"
        ? { ...body, dataset }
        : { comparisonDays: selectedComparisonDays, ...body, dataset };
      const response = await fetch("/api/daily-analysis/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not generate report.");
      setReport(data.report);
      setHistory(prev => {
        const nextHistory = [data.report, ...prev.filter(item => item.generationKey !== data.report.generationKey)].slice(0, 20);
        try { localStorage.setItem("querypilot.dailyReports", JSON.stringify(nextHistory)); } catch { /* ignore storage quota */ }
        return nextHistory;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not generate report.");
    } finally { setBusy(false); }
  }

  async function downloadPdf(target: AnalysisReport) {
    const busyKey = target.id || -1;
    setPdfBusyId(busyKey);
    setPdfMessage("");
    setError("");
    try {
      const downloadResponse = await fetch(`/api/daily-analysis/reports/${target.id || 1}/pdf`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(target) });
      if (!downloadResponse.ok) throw new Error((await downloadResponse.json()).error || "Could not download the PDF.");
      const blob = await downloadResponse.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      const filename = `querypilot-x-report-${target.reportKind}-${target.periodStart}-to-${target.periodEnd}.pdf`;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      const generatedAt = new Date().toISOString();
      setReport(current => current && current.generationKey === target.generationKey ? { ...current, pdfStatus: "generated", pdfFilename: filename, pdfGeneratedAt: generatedAt } : current);
      setHistory(prev => {
        const nextHistory = prev.map(item => item.generationKey === target.generationKey ? { ...item, pdfStatus: "generated" as const, pdfFilename: filename, pdfGeneratedAt: generatedAt } : item);
        try { localStorage.setItem("querypilot.dailyReports", JSON.stringify(nextHistory)); } catch { /* ignore */ }
        return nextHistory;
      });
      setPdfMessage("PDF download completed.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not download the PDF.");
    } finally {
      setPdfBusyId(null);
    }
  }

  useEffect(() => {
    const savedSettings = localStorage.getItem("querypilot.dailySettings");
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings) as AnalysisSettings;
        setSettings(parsed);
        setComparisonDays(["7", "15", "30", "90", "365"].includes(String(parsed.comparisonDays)) ? String(parsed.comparisonDays) : "custom");
        setCustomDays(String(parsed.comparisonDays));
      } catch { /* use defaults */ }
    }
    void Promise.all([loadTables(), loadHistory()]).catch(reason => setError(reason instanceof Error ? reason.message : "Could not load Supabase data."));
  }, []);

  const currentTable = useMemo(() => tables.find(table => table.name === selectedTable), [tables, selectedTable]);
  const autoMapping = useMemo<Partial<DatasetMapping>>(() => currentTable ? detectDatasetColumns(currentTable) : {}, [currentTable]);
  const hasRequiredColumns = Boolean((mapping.orderId || autoMapping.orderId) && (mapping.orderDate || autoMapping.orderDate));

  useEffect(() => {
    if (selectedTable && !report && hasRequiredColumns) void generate();
  }, [selectedTable]);

  const comparison = report?.comparisonDailyAverage;
  const selectedComparisonDays = comparisonDays === "custom" ? Number(customDays) : Number(comparisonDays);
  const comparisonDaysValid = Number.isInteger(selectedComparisonDays) && selectedComparisonDays >= 1 && selectedComparisonDays <= 3650;
  const customHistoricalRangeValid = range !== "custom" || (/^\d{4}-\d{2}-\d{2}$/.test(customStart) && /^\d{4}-\d{2}-\d{2}$/.test(customEnd) && customStart <= customEnd);
  const revenueAvailable = !report?.availableMetrics || report.availableMetrics.includes("totalRevenue");
  const change = useMemo(() => revenueAvailable && report && comparison && comparison.totalRevenue ? ((report.current.totalRevenue - comparison.totalRevenue) / comparison.totalRevenue) * 100 : null, [revenueAvailable, report, comparison]);

  return <div className="analysis-dashboard">
    <div className="analysis-toolbar">
      <button className="back-button" onClick={onBack}>Back to workspace</button>
      <div className="analysis-toolbar-actions">
        <span className="connection-status" title="Read-only Supabase connection"><ShieldCheck size={14}/> Read-only Supabase{selectedTable ? ` · ${selectedTable}` : ""}</span>
        <button className="secondary-button" onClick={() => setSettingsOpen(!settingsOpen)}><Settings size={14}/> Settings</button>
        <button className="secondary-button" disabled={busy || pdfBusyId !== null || !selectedTable || !comparisonDaysValid} onClick={() => void generate({ comparisonDays: selectedComparisonDays })}><RefreshCw size={14} className={busy ? "spinning" : ""}/> Refresh report</button>
        {report && <button className="secondary-button" disabled={busy || pdfBusyId !== null} onClick={() => void downloadPdf(report)}><Download size={14}/>{pdfBusyId === (report.id || -1) ? "Generating PDF..." : "Download PDF"}</button>}
      </div>
    </div>
    <div className="section-heading"><div><div className="section-eyebrow">DAILY ANALYSIS & REPORTS</div><h1>Performance at a glance.</h1><p>Completed orders are recognized; other statuses remain visible separately.</p></div></div>
    <div className="report-controls">
      <label>Supabase table <select value={selectedTable} onChange={event => { setSelectedTable(event.target.value); setMapping({}); setError(""); setReport(null); }}><option value="">Select a table</option>{tables.map(table => <option key={table.name} value={table.name}>{table.name}</option>)}</select></label>
      {mappingFields.map(([key, label]) => selectedTable && (
        <label key={key}>{label} <select value={mapping[key] || ""} onChange={event => setMapping({ ...mapping, [key]: event.target.value })}>
          <option value="">{autoMapping[key] ? `Auto (${autoMapping[key]})` : "Automatic / unavailable"}</option>
          {currentTable?.columns.map(column => <option key={column} value={column}>{column}</option>)}
        </select></label>
      ))}
      <label>Compare previous <select value={comparisonDays} onChange={event => setComparisonDays(event.target.value)}><option value="7">7 days</option><option value="15">15 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">365 days</option><option value="custom">Custom days</option></select></label>
      {comparisonDays === "custom" && <><input className="days-input" type="number" min="1" max="3650" value={customDays} onChange={event => setCustomDays(event.target.value)} aria-label="Custom comparison days" aria-invalid={!comparisonDaysValid}/>{!comparisonDaysValid && <span className="input-error">Enter 1-3650 days.</span>}</>}
      <button className="secondary-button" disabled={busy || !selectedTable || !comparisonDaysValid} onClick={() => void generate({ comparisonDays: selectedComparisonDays })}>Apply comparison</button>
      <label>Historical <select value={range} onChange={event => setRange(event.target.value)}><option value="week">Last 1 week</option><option value="three-months">Last 3 months</option><option value="year">Last 1 year</option><option value="all">First sale to today</option><option value="custom">Custom dates</option></select></label>
      {range === "custom" && <><input className="days-input" type="date" value={customStart} onChange={event => setCustomStart(event.target.value)} aria-label="Historical start date"/><input className="days-input" type="date" value={customEnd} onChange={event => setCustomEnd(event.target.value)} aria-label="Historical end date"/>{!customHistoricalRangeValid && <span className="input-error">Enter a valid start and end date.</span>}</>}
      <button className="secondary-button" disabled={busy || !selectedTable || !customHistoricalRangeValid} onClick={() => void generate({ kind: "historical", range, start: range === "custom" ? customStart : undefined, end: range === "custom" ? customEnd : undefined })}>Generate history</button>
    </div>
    {selectedTable && !hasRequiredColumns && !error && <div className="analysis-empty-panel">Select the <strong>Order ID</strong> and <strong>Order date</strong> columns above, then click <strong>Apply comparison</strong> or <strong>Generate history</strong>.</div>}
    {error && <div className="analysis-error">{error}</div>}
    {pdfMessage && <div className="pdf-status">{pdfMessage}</div>}
    {settingsOpen && <section className="analysis-card settings-card">
      <div className="card-title"><h2>Report settings</h2><span>Preferences only; stored in this browser without writing to Supabase.</span></div>
      <div className="settings-grid">
        <label>Comparison days<input className="days-input" type="number" min="1" max="3650" value={settings.comparisonDays} onChange={event => setSettings({ ...settings, comparisonDays: Number(event.target.value) })}/></label>
        <label>Timezone<input className="settings-input" value={settings.timezone} onChange={event => setSettings({ ...settings, timezone: event.target.value })}/></label>
        <label>Scheduled time<input className="settings-input" type="time" value={settings.scheduledTime} onChange={event => setSettings({ ...settings, scheduledTime: event.target.value })}/></label>
        <label className="settings-check"><input type="checkbox" checked={settings.dailyReportEnabled} onChange={event => setSettings({ ...settings, dailyReportEnabled: event.target.checked })}/> Daily report enabled</label>
        <label className="settings-check"><input type="checkbox" checked={settings.notificationEnabled} onChange={event => setSettings({ ...settings, notificationEnabled: event.target.checked })}/> Notifications enabled</label>
        <button className="secondary-button settings-save" disabled={settingsBusy} onClick={() => void saveSettings()}>{settingsBusy ? "Saving..." : "Save settings"}</button>
      </div>
      {settingsMessage && <p className="settings-message">{settingsMessage}</p>}
    </section>}
    {!report && !error && hasRequiredColumns && <div className="analysis-empty-panel">Loading read-only Supabase records...</div>}
    {report && <>
      <div className="report-meta">
        <CalendarDays size={15}/> Reporting date: <strong>{report.reportingDate}</strong>
        <span>Period: {report.periodStart} to {report.periodEnd}</span>
        {report.comparisonStart && <span>Comparison: {report.comparisonStart} to {report.comparisonEnd} ({report.comparisonDays} days)</span>}
        <span><Database size={13}/> Table: <strong>{report.dataset?.table || selectedTable}</strong></span>
      </div>
      <div className="analysis-stat-grid">{([
        ["Revenue", "totalRevenue", money(report.current.totalRevenue), DollarSign],
        ["Orders", "totalOrders", number(report.current.totalOrders), BarChart3],
        ["Units sold", "totalUnitsSold", number(report.current.totalUnitsSold), Activity],
        ["Product lines", "totalProductLines", number(report.current.totalProductLines), BarChart3],
        ["Gross profit", "grossProfit", money(report.current.grossProfit), TrendingUp],
        ["Profit margin", "grossProfitMargin", `${number(report.current.grossProfitMargin)}%`, TrendingUp],
        ["Discounts", "totalDiscounts", money(report.current.totalDiscounts), DollarSign],
        ["Avg. order value", "averageOrderValue", money(report.current.averageOrderValue), DollarSign],
        ["Avg. rating", "averageCustomerRating", report.current.averageCustomerRating === null ? "—" : number(report.current.averageCustomerRating), Star]
      ] as Array<[string, string, string, LucideIcon]>).map(([label, key, value, Icon]) => <div className="analysis-stat" key={label}><Icon size={16}/><span>{label}</span><strong>{displayMetric(report, key, value)}</strong></div>)}</div>
      {report.availableMetrics && report.availableMetrics.length < 9 && <div className="analysis-empty">Some KPIs are unavailable because the selected Supabase table does not provide those columns.</div>}
      {change !== null && <div className={"comparison-note " + (change >= 0 ? "positive" : "negative")}>{change >= 0 ? "Growth" : "Decline"} of {Math.abs(change).toFixed(1)}% revenue versus the comparison daily average.</div>}
      <div className="trend-grid"><Trend report={report} metric="totalRevenue" title="Revenue trend" format={money}/><Trend report={report} metric="totalOrders" title="Orders trend" format={number}/><Trend report={report} metric="grossProfit" title="Gross profit trend" format={money}/></div>
      <div className="analysis-grid"><section className="analysis-card"><h2>Order status distribution</h2>{Object.entries(report.current.statusDistribution).map(([label, value]) => <div className="status-row" key={label}><span>{label}</span><strong>{value}</strong></div>)}</section></div>
      <div className="analysis-grid"><MiniBars title="Product performance" items={report.productPerformance} valueKey="revenue"/><MiniBars title="Category performance" items={report.categoryPerformance} valueKey="revenue"/><MiniBars title="Region performance" items={report.regionPerformance} valueKey="revenue"/><MiniBars title="Gender performance" items={report.genderPerformance} valueKey="orders"/></div>
      <section className="analysis-card history-card"><h2>Report history</h2>{history.length ? history.map((item, index) => <div className="history-entry" key={item.generationKey || item.id || index}><button onClick={() => setReport(item)}><span>{item.reportKind} · {item.reportingDate}{item.dataset?.table ? ` (${item.dataset.table})` : ""}</span><small>{item.periodStart} to {item.periodEnd} · {item.status} · PDF: {item.pdfStatus === "generated" ? "ready" : item.pdfStatus === "failed" ? "failed" : "not generated"}</small></button><button className="history-download" disabled={pdfBusyId !== null} onClick={() => void downloadPdf(item)}><Download size={13}/>{pdfBusyId === (item.id || -1) ? "Generating..." : item.pdfStatus === "generated" ? "PDF" : "Generate PDF"}</button></div>) : <p className="analysis-empty">No generated reports yet.</p>}</section>
    </>}
  </div>;
}
