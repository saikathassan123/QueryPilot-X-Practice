"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Columns3, Database, RefreshCw, Search, ShieldCheck, Table2 } from "lucide-react";

export type Table = { name: string; columns: string[] };

type Props = {
  tables: Table[];
  loading: boolean;
  onRefresh: () => void;
};

export default function DatasetsPanel({ tables, loading, onRefresh }: Props) {
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const current = tables.find(table => table.name === selected) || tables[0];
  const filtered = tables.filter(table => table.name.toLowerCase().includes(search.toLowerCase()));
  const columns = tables.reduce((total, table) => total + table.columns.length, 0);

  useEffect(() => {
    if (tables.length && !tables.some(table => table.name === selected)) setSelected(tables[0].name);
  }, [tables, selected]);

  return (
    <section className="datasets-panel">
      <div className="section-eyebrow">SMART DATA ANALYSIS & VISUALIZATION</div>
      <div className="section-heading">
        <div>
          <h1>Connected datasets</h1>
          <p>Explore the tables available in your Supabase project.</p>
        </div>
        <button className="secondary-button" type="button" disabled={loading} onClick={onRefresh}>
          <RefreshCw size={15} className={loading ? "spinning" : ""}/> Refresh
        </button>
      </div>

      <div className="stat-grid">
        <div className="stat-card"><Database size={18}/><span>Datasets</span><strong>{tables.length}</strong></div>
        <div className="stat-card"><Columns3 size={18}/><span>Total columns</span><strong>{columns}</strong></div>
        <div className="stat-card"><ShieldCheck size={18}/><span>Connection</span><strong className="stat-connected"><CheckCircle2 size={16}/> Read only</strong></div>
      </div>

      <div className="dataset-content">
        <div className="dataset-list">
          <div className="dataset-list-top">
            <h2>Available tables <span>{tables.length}</span></h2>
            <div className="search-field"><Search size={15}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a table" aria-label="Find a table"/></div>
          </div>
          {loading && <p className="empty-message">Loading datasets...</p>}
          {!loading && !tables.length && <p className="empty-message">No readable tables were found.</p>}
          {!loading && tables.length > 0 && filtered.length === 0 && <p className="empty-message">No tables match your search.</p>}
          {filtered.map(table => (
            <button key={table.name} className={"dataset-row " + (current?.name === table.name ? "selected" : "")} type="button" onClick={() => setSelected(table.name)}>
              <span className="dataset-icon"><Table2 size={18}/></span>
              <span className="dataset-name"><strong>{table.name}</strong><small>{table.columns.length} columns</small></span>
              <span className="dataset-chevron">›</span>
            </button>
          ))}
        </div>

        <div className="dataset-details">
          <div className="details-top"><h2>Dataset details</h2><span>PUBLIC SCHEMA</span></div>
          {current ? (
            <>
              <div className="selected-dataset"><div className="dataset-icon large"><Table2 size={21}/></div><strong>{current.name}</strong><p>{current.columns.length} available columns</p></div>
              <h3>Columns</h3>
              <div className="column-list">
                {current.columns.map((column, index) => <div className="column-row" key={column}><span>{column}</span><small>{String(index + 1).padStart(2, "0")}</small></div>)}
              </div>
            </>
          ) : <p className="empty-message">Select a table to view its columns.</p>}
        </div>
      </div>
      <p className="module-note">Only dataset and column names are displayed. Analysis and visualization tools will be added to this module later.</p>
    </section>
  );
}
