"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BarChart3, Bell, Check, Database, Eye, EyeOff, LockKeyhole, LogOut, ShieldCheck, ShieldAlert } from "lucide-react";
import DatasetsPanel, { type Table } from "@features/smart_data_analysis_and_visualization/components/DatasetsPanel";
import DailyAnalysisDashboard from "@features/daily_data_analysis_and_notification/components/DailyAnalysisDashboard";

type Project = { id: string; name: string };
type Session = {
  connected: boolean;
  configured: boolean;
  oauthEnabled: boolean;
  projectName: string;
  projectRef: string;
  projects: Project[];
  mode: "oauth" | "postgres" | null;
};

type Screen = "home" | "setup" | "dashboard" | "daily-analysis";

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [manual, setManual] = useState(false);
  const [projectRef, setProjectRef] = useState("");
  const [databaseUri, setDatabaseUri] = useState("");
  const [showUri, setShowUri] = useState(false);
  const [tables, setTables] = useState<Table[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingTables, setLoadingTables] = useState(false);
  const [error, setError] = useState("");

  async function loadSession() {
    const response = await fetch("/api/session", { cache: "no-store" });
    if (!response.ok) throw new Error("Cannot load connection status.");
    const data: Session = await response.json();
    setSession(data);
    setProjectRef(data.projectRef || data.projects[0]?.id || "");
    return data;
  }

  async function loadTables() {
    setLoadingTables(true);
    try {
      const response = await fetch("/api/tables", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Cannot load datasets.");
      setTables(data.tables || []);
    } catch (err) {
      setTables([]);
      setError(err instanceof Error ? err.message : "Cannot load datasets.");
    } finally {
      setLoadingTables(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const message = params.get("error");
    if (message) setError(message);

    loadSession().then(data => {
      if (data.connected) {
        setScreen("dashboard");
        void loadTables();
      } else if (data.projects.length || params.has("setup")) {
        setScreen("setup");
        setManual(!data.projects.length);
      }
    }).catch(() => setError("Cannot load your session. Check server settings."));

    if (params.toString()) window.history.replaceState({}, "", "/");
  }, []);

  function beginSetup() {
    if (!session?.configured) {
      setError("Add SESSION_SECRET to your environment variables before connecting.");
      return;
    }
    setError("");
    setManual(!session.oauthEnabled && !session.projects.length);
    setScreen("setup");
  }

  async function connectProject() {
    if (!projectRef) return;
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/projects/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectRef })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not connect the project.");
      await loadSession();
      setScreen("dashboard");
      await loadTables();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function connectManually(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!databaseUri.trim()) return;
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uri: databaseUri.trim() })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not connect to the database.");
      setDatabaseUri("");
      await loadSession();
      setScreen("dashboard");
      await loadTables();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/disconnect", { method: "POST" });
      if (!response.ok) throw new Error("Could not disconnect.");
      setTables([]);
      await loadSession();
      setScreen("home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      {(screen === "home" || screen === "setup") && <header className="top-brand"><div className="brand-mark"><Database size={19}/></div><span>Query<strong>Pilot</strong></span></header>}

      {!session && <div className="loading-screen"><Database size={30}/><p>Loading QueryPilot...</p></div>}

      {session && screen === "home" && (
        <main className="welcome">
          <div className="hero-icon"><Database size={29}/></div>
          <div className="eyebrow">YOUR DATA WORKSPACE</div>
          <h1>Your data,<span> connected.</span></h1>
          <p>One place for smart analysis, daily updates, and fraud monitoring.<br/>Connect a Supabase project to begin.</p>
          <button className="primary welcome-button" onClick={beginSetup}><Database size={18}/> Connect your database <ArrowRight size={17}/></button>
          <div className="hint"><ShieldCheck size={15}/> Secure, read-only Supabase connection</div>
        </main>
      )}

      {session && screen === "setup" && (
        <main className="setup">
          <button className="back" onClick={() => { setError(""); setScreen(session.connected ? "dashboard" : "home"); }}><ArrowLeft size={15}/> Back</button>
          <div className="setup-icon"><Database size={25}/></div>
          <h1>{!manual && session.projects.length ? "Choose your project" : "Connect your database"}</h1>
          <p className="muted">Authorize a Supabase project or connect using its read-only PostgreSQL connection string.</p>

          {!manual && !session.projects.length && session.oauthEnabled && (
            <button className="primary full" onClick={() => window.location.assign("/api/auth/start")}><Database size={18}/> Authorize with Supabase <ArrowRight size={17}/></button>
          )}

          {!manual && session.projects.length > 0 && (
            <div className="project-list">
              <div className="field-title">AUTHORIZED PROJECTS</div>
              {session.projects.map(project => (
                <button type="button" key={project.id} className={"project " + (projectRef === project.id ? "active" : "")} onClick={() => setProjectRef(project.id)}>
                  <Database size={18}/><span><strong>{project.name}</strong><small>{project.id}</small></span>{projectRef === project.id && <Check size={16}/>}
                </button>
              ))}
              <button className="primary full" disabled={!projectRef || busy} onClick={connectProject}>{busy ? "Connecting..." : "Connect selected project"}<ArrowRight size={17}/></button>
            </div>
          )}

          {manual && (
            <form onSubmit={connectManually} className="connect-form">
              <label htmlFor="database-uri">PostgreSQL connection string</label>
              <div className="uri-input">
                <input id="database-uri" type={showUri ? "text" : "password"} value={databaseUri} onChange={event => setDatabaseUri(event.target.value)}
                  placeholder="postgresql://user.project:password@...pooler.supabase.com:5432/postgres" autoComplete="off" spellCheck={false} required/>
                <button type="button" aria-label={showUri ? "Hide connection string" : "Show connection string"} onClick={() => setShowUri(!showUri)}>
                  {showUri ? <EyeOff size={17}/> : <Eye size={17}/>}
                </button>
              </div>
              <button className="primary full" disabled={!databaseUri.trim() || busy} type="submit"><LockKeyhole size={16}/>{busy ? "Verifying connection..." : "Connect securely"}<ArrowRight size={17}/></button>
            </form>
          )}

          {session.oauthEnabled && <button className="text-button" type="button" onClick={() => {
            if (manual && !session.projects.length) window.location.assign("/api/auth/start");
            else setManual(!manual);
          }}>{manual ? session.projects.length ? "Use authorized projects" : "Connect using Supabase OAuth" : "Use a PostgreSQL connection string"}<ArrowRight size={15}/></button>}
          <div className="safe-note"><ShieldCheck size={17}/><span>Connections are stored in encrypted browser sessions. For manual access, use a database account with SELECT-only permissions.</span></div>
          <a className="help-link" href="https://supabase.com/docs/guides/database/connecting-to-postgres" target="_blank" rel="noreferrer">Where do I find my connection string?</a>
        </main>
      )}

      {session && (screen === "dashboard" || screen === "daily-analysis") && (
        <div className="workspace">
          <header className="workspace-header">
            <div className="brand-inline"><div className="brand-mark"><Database size={18}/></div>Query<strong>Pilot</strong></div>
            <div className="header-actions"><span className="connection-status"><i/>{session.projectName || "Supabase project"}</span>
              <button className="small-button" onClick={() => { setManual(session.mode === "postgres"); setScreen("setup"); }}>Switch</button>
              <button className="icon-button" title="Disconnect" aria-label="Disconnect" disabled={busy} onClick={disconnect}><LogOut size={18}/></button>
            </div>
          </header>

          <div className="workspace-body">
            <nav className="module-sidebar" aria-label="Project modules">
              <div className="module-label">WORKSPACE</div>
              <button className={"module-link " + (screen === "dashboard" ? "active" : "")} onClick={() => setScreen("dashboard")}><BarChart3 size={17}/><span>Smart data analysis</span></button>
              <button className={"module-link " + (screen === "daily-analysis" ? "active" : "")} onClick={() => setScreen("daily-analysis")}><Bell size={17}/><span>Daily analysis</span></button>
              <div className="module-link disabled"><ShieldAlert size={17}/><span>Fraud detection</span><small>Soon</small></div>
              <div className="module-bottom"><ShieldCheck size={15}/> Read-only connection</div>
            </nav>
            <main className="main-panel">{screen === "daily-analysis" ? <DailyAnalysisDashboard onBack={() => setScreen("dashboard")}/> : <DatasetsPanel tables={tables} loading={loadingTables} onRefresh={() => void loadTables()}/>}</main>
            <aside className="details-panel">
              <div className="aside-heading"><Database size={20}/><h2>Connection details</h2></div>
              <div className="detail"><span>Project</span><strong>{session.projectName || "Supabase project"}</strong></div>
              <div className="detail"><span>Project reference</span><strong className="reference">{session.projectRef || "Not selected"}</strong></div>
              <div className="detail"><span>Connection method</span><strong>{session.mode === "oauth" ? "Supabase OAuth" : "PostgreSQL"}</strong></div>
              <div className="detail"><span>Connected tables</span><strong>{tables.length}</strong></div>
              <div className="detail"><span>Database access</span><strong className="read-only"><ShieldCheck size={14}/> Read only</strong></div>
              <div className="aside-foot"><LockKeyhole size={15}/> Connection credentials are never shown in the browser.</div>
            </aside>
          </div>
        </div>
      )}

      {error && <div className="error" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Close message">×</button></div>}
      {screen !== "dashboard" && <div className="footer">QUERY PILOT <span>·</span> DATA MADE CLEAR</div>}
    </div>
  );
}
