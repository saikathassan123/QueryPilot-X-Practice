"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, CalendarDays, DollarSign, Download, RefreshCw, Settings, Star, TrendingUp, type LucideIcon } from "lucide-react";
import type { AnalysisDimension, AnalysisReport } from "../types";
import type { AnalysisSettings } from "../settings";

type Props = { onBack: () => void };
const money = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const number = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });

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
  const values = report.dailyPerformance;
  const max = Math.max(...values.map(item => item[metric]), 1);
  const points = values.map((item, index) => `${values.length === 1 ? 50 : (index / (values.length - 1)) * 100},${100 - (item[metric] / max) * 90}`).join(" ");
  return <section className="analysis-card trend-card"><div className="card-title"><h2>{title}</h2><span>{report.periodStart} to {report.periodEnd}</span></div>{values.length ? <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={title}><polyline points={points}/></svg> : <p className="analysis-empty">No completed sales.</p>}<div className="trend-labels"><span>{title}</span><strong>{format(report.current[metric])}</strong></div></section>;
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
  const [settings, setSettings] = useState<AnalysisSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");

  async function loadHistory() {
    const response = await fetch("/api/daily-analysis/reports?limit=20", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load report history.");
    setHistory(data.reports || []);
  }

  async function loadSettings() {
    const response = await fetch("/api/daily-analysis/settings", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load report settings.");
    setSettings(data.settings);
  }

  async function saveSettings() {
    if (!settings) return;
    setSettingsBusy(true); setSettingsMessage(""); setError("");
    try {
      const response = await fetch("/api/daily-analysis/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save report settings.");
      setSettings(data.settings);
      setComparisonDays(String(data.settings.comparisonDays));
      setSettingsMessage("Settings saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save report settings.");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function generate(body: Record<string, unknown> = {}) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/daily-analysis/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not generate report.");
      setReport(data.report);
      await loadHistory();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not generate report.");
    } finally { setBusy(false); }
  }

  async function downloadPdf(target: AnalysisReport) {
    if (!target.id) {
      setError("This report does not have a persisted identifier.");
      return;
    }
    setPdfBusyId(target.id);
    setPdfMessage("");
    setError("");
    try {
      const path = `/api/daily-analysis/reports/${target.id}/pdf`;
      const generateResponse = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" } });
      const generated = await generateResponse.json();
      if (!generateResponse.ok) throw new Error(generated.error || "Could not generate the PDF.");
      const downloadResponse = await fetch(generated.downloadUrl, { cache: "no-store" });
      if (!downloadResponse.ok) {
        const data = await downloadResponse.json().catch(() => ({}));
        throw new Error(data.error || "Could not download the PDF.");
      }
      const blob = await downloadResponse.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = generated.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setPdfMessage("PDF download completed.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not download the PDF.");
    } finally {
      setPdfBusyId(null);
    }
  }

  useEffect(() => {
    void Promise.all([loadSettings(), loadHistory()]).catch(reason => setError(reason instanceof Error ? reason.message : "Could not load report settings."));
    void generate();
  }, []);
  const comparison = report?.comparisonDailyAverage;
  const selectedComparisonDays = comparisonDays === "custom" ? Number(customDays) : Number(comparisonDays);
  const comparisonDaysValid = Number.isInteger(selectedComparisonDays) && selectedComparisonDays >= 1 && selectedComparisonDays <= 3650;
  const customHistoricalRangeValid = range !== "custom" || (/^\d{4}-\d{2}-\d{2}$/.test(customStart) && /^\d{4}-\d{2}-\d{2}$/.test(customEnd) && customStart <= customEnd);
  const change = useMemo(() => report && comparison && comparison.totalRevenue ? ((report.current.totalRevenue - comparison.totalRevenue) / comparison.totalRevenue) * 100 : null, [report, comparison]);

  return <div className="analysis-dashboard">
    <div className="analysis-toolbar"><button className="back-button" onClick={onBack}>Back to workspace</button><div className="analysis-toolbar-actions"><button className="secondary-button" onClick={() => setSettingsOpen(!settingsOpen)}><Settings size={14}/> Settings</button><button className="secondary-button" disabled={busy || pdfBusyId !== null || !Number.isInteger(selectedComparisonDays) || selectedComparisonDays < 1} onClick={() => void generate({ comparisonDays: selectedComparisonDays })}><RefreshCw size={14} className={busy ? "spinning" : ""}/> Refresh report</button>{report?.id && <button className="secondary-button" disabled={busy || pdfBusyId !== null} onClick={() => void downloadPdf(report)}><Download size={14}/>{pdfBusyId === report.id ? "Generating PDF..." : "Download PDF"}</button>}</div></div>
    <div className="section-heading"><div><div className="section-eyebrow">DAILY ANALYSIS & REPORTS</div><h1>Performance at a glance.</h1><p>Completed orders are recognized; other statuses remain visible separately.</p></div></div>
    <div className="report-controls"><label>Compare previous <select value={comparisonDays} onChange={event => setComparisonDays(event.target.value)}><option value="7">7 days</option><option value="15">15 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">365 days</option><option value="custom">Custom days</option></select></label>{comparisonDays === "custom" && <><input className="days-input" type="number" min="1" max="3650" value={customDays} onChange={event => setCustomDays(event.target.value)} aria-label="Custom comparison days" aria-invalid={!comparisonDaysValid}/>{!comparisonDaysValid && <span className="input-error">Enter 1-3650 days.</span>}</>}<button className="secondary-button" disabled={busy || !comparisonDaysValid} onClick={() => void generate({ comparisonDays: selectedComparisonDays })}>Apply comparison</button><label>Historical <select value={range} onChange={event => setRange(event.target.value)}><option value="week">Last 1 week</option><option value="three-months">Last 3 months</option><option value="year">Last 1 year</option><option value="all">First sale to today</option><option value="custom">Custom dates</option></select></label>{range === "custom" && <><input className="days-input" type="date" value={customStart} onChange={event => setCustomStart(event.target.value)} aria-label="Historical start date"/><input className="days-input" type="date" value={customEnd} onChange={event => setCustomEnd(event.target.value)} aria-label="Historical end date"/>{!customHistoricalRangeValid && <span className="input-error">Enter a valid start and end date.</span>}</>}<button className="secondary-button" disabled={busy || !customHistoricalRangeValid} onClick={() => void generate({ kind: "historical", range, start: range === "custom" ? customStart : undefined, end: range === "custom" ? customEnd : undefined })}>Generate history</button></div>
    {error && <div className="analysis-error">{error}</div>}
    {pdfMessage && <div className="pdf-status">{pdfMessage}</div>}
    {settingsOpen && <section className="analysis-card settings-card">
      <div className="card-title"><h2>Report settings</h2><span>Preferences only; no scheduler or delivery is started.</span></div>
      {settings ? <div className="settings-grid">
        <label>Comparison days<input className="days-input" type="number" min="1" max="3650" value={settings.comparisonDays} onChange={event => setSettings({ ...settings, comparisonDays: Number(event.target.value) })}/></label>
        <label>Timezone<input className="settings-input" value={settings.timezone} onChange={event => setSettings({ ...settings, timezone: event.target.value })}/></label>
        <label>Scheduled time<input className="settings-input" type="time" value={settings.scheduledTime} onChange={event => setSettings({ ...settings, scheduledTime: event.target.value })}/></label>
        <label className="settings-check"><input type="checkbox" checked={settings.dailyReportEnabled} onChange={event => setSettings({ ...settings, dailyReportEnabled: event.target.checked })}/> Daily report enabled</label>
        <label className="settings-check"><input type="checkbox" checked={settings.notificationEnabled} onChange={event => setSettings({ ...settings, notificationEnabled: event.target.checked })}/> Notifications enabled</label>
        <button className="secondary-button settings-save" disabled={settingsBusy} onClick={() => void saveSettings()}>{settingsBusy ? "Saving..." : "Save settings"}</button>
      </div> : <p className="analysis-empty">Loading settings...</p>}
      {settingsMessage && <p className="settings-message">{settingsMessage}</p>}
    </section>}
    {!report && !error && <div className="analysis-empty-panel">Loading real local SQLite records...</div>}
    {report && <><div className="report-meta"><CalendarDays size={15}/> Reporting date: <strong>{report.reportingDate}</strong><span>Period: {report.periodStart} to {report.periodEnd}</span>{report.comparisonStart && <span>Comparison: {report.comparisonStart} to {report.comparisonEnd} ({report.comparisonDays} days)</span>}</div>
      <div className="analysis-stat-grid">{([
        ["Revenue", money(report.current.totalRevenue), DollarSign], ["Orders", number(report.current.totalOrders), BarChart3], ["Units sold", number(report.current.totalUnitsSold), Activity], ["Product lines", number(report.current.totalProductLines), BarChart3], ["Gross profit", money(report.current.grossProfit), TrendingUp], ["Profit margin", `${number(report.current.grossProfitMargin)}%`, TrendingUp], ["Discounts", money(report.current.totalDiscounts), DollarSign], ["Avg. order value", money(report.current.averageOrderValue), DollarSign], ["Avg. rating", report.current.averageCustomerRating === null ? "—" : number(report.current.averageCustomerRating), Star]
      ] as Array<[string, string, LucideIcon]>).map(([label, value, Icon]) => <div className="analysis-stat" key={label}><Icon size={16}/><span>{label}</span><strong>{value}</strong></div>)}</div>
      {change !== null && <div className={"comparison-note " + (change >= 0 ? "positive" : "negative")}>{change >= 0 ? "Growth" : "Decline"} of {Math.abs(change).toFixed(1)}% revenue versus the comparison daily average.</div>}
      <div className="trend-grid"><Trend report={report} metric="totalRevenue" title="Revenue trend" format={money}/><Trend report={report} metric="totalOrders" title="Orders trend" format={number}/><Trend report={report} metric="grossProfit" title="Gross profit trend" format={money}/></div>
      <div className="analysis-grid"><section className="analysis-card"><h2>Order status distribution</h2>{Object.entries(report.current.statusDistribution).map(([label, value]) => <div className="status-row" key={label}><span>{label}</span><strong>{value}</strong></div>)}</section></div>
      <div className="analysis-grid"><MiniBars title="Product performance" items={report.productPerformance} valueKey="revenue"/><MiniBars title="Category performance" items={report.categoryPerformance} valueKey="revenue"/><MiniBars title="Region performance" items={report.regionPerformance} valueKey="revenue"/><MiniBars title="Gender performance" items={report.genderPerformance} valueKey="orders"/></div>
      <section className="analysis-card history-card"><h2>Report history</h2>{history.length ? history.map(item => <div className="history-entry" key={item.id}><button onClick={() => setReport(item)}><span>{item.reportKind} · {item.reportingDate}</span><small>{item.periodStart} to {item.periodEnd} · {item.status} · PDF: {item.pdfStatus === "generated" ? "ready" : item.pdfStatus === "failed" ? "failed" : "not generated"}</small></button>{item.id && <button className="history-download" disabled={pdfBusyId !== null} onClick={() => void downloadPdf(item)}><Download size={13}/>{pdfBusyId === item.id ? "Generating..." : item.pdfStatus === "generated" ? "PDF" : "Generate PDF"}</button>}</div>) : <p className="analysis-empty">No generated reports yet.</p>}</section>
    </>}
  </div>;
}
