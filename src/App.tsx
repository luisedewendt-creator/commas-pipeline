import { useCallback, useEffect, useMemo, useState } from "react";
import { crmConfig } from "../config/crm.config.ts";
import type { PipelineSnapshot } from "../shared/types.ts";
import { Board } from "./components/Board";
import { DealDrawer } from "./components/DealDrawer";
import { GrokChat } from "./components/GrokChat";
import { ListView } from "./components/ListView";
import { Login } from "./components/Login";
import { VoicePanel } from "./components/VoicePanel";
import { ApiError, api } from "./lib/api.ts";
import { applyTheme, formatMoney } from "./lib/format.ts";

type View = "board" | "list";
type Filter = "all" | "due" | "approved";
type Panel = "none" | "grok" | "voice";

export default function App() {
  const [snapshot, setSnapshot] = useState<PipelineSnapshot | null>(null);
  const [view, setView] = useState<View>("board");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [openDealId, setOpenDealId] = useState<string | "new" | null>(null);
  const [panel, setPanel] = useState<Panel>("none");
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [booting, setBooting] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const next = await api.snapshot();
      setSnapshot(next);
      setNeedsLogin(false);
      setError("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuthRequired(true);
        setNeedsLogin(true);
        setSnapshot(null);
        return;
      }
      throw err;
    }
  }, []);

  useEffect(() => {
    applyTheme();
    refresh()
      .catch((err: Error) => {
        if (err instanceof ApiError && err.status === 401) {
          setAuthRequired(true);
          setNeedsLogin(true);
          return;
        }
        setError(err.message);
      })
      .finally(() => setBooting(false));
  }, [refresh]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenDealId(null);
        setPanel("none");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const visible = useMemo(() => {
    const deals = snapshot?.deals ?? [];
    const q = query.trim().toLowerCase();
    return deals.filter((deal) => {
      if (filter === "due" && deal.status !== "overdue" && deal.status !== "due_today") return false;
      if (filter === "approved" && deal.stage !== "approved") return false;
      if (!q) return true;
      return [deal.name, deal.company, deal.contactName, deal.email, deal.notes, deal.phone]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [snapshot, filter, query]);

  async function logout() {
    await api.logout();
    setSnapshot(null);
    setOpenDealId(null);
    setPanel("none");
    setNeedsLogin(true);
    setAuthRequired(true);
  }

  async function moveDeal(id: string, stage: string) {
    await api.updateDeal(id, { stage });
    await refresh();
    if (openDealId === id) {
      // drawer watches the same deal via its own fetch after parent refresh
    }
  }

  if (booting && !snapshot && !needsLogin) {
    return (
      <div className="login-page">
        <p className="empty">Loading…</p>
      </div>
    );
  }

  if (needsLogin) {
    return <Login onLoggedIn={() => void refresh()} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>{crmConfig.appName}</h1>
          <span>{crmConfig.tagline}</span>
        </div>
        <div className="stats">
          <div className="stat">
            <em>Open deals</em>
            <strong>{snapshot?.openDealCount ?? 0}</strong>
          </div>
          <div className="stat">
            <em>Pipeline {crmConfig.valueField.shortLabel}</em>
            <strong>{formatMoney(snapshot?.pipelineGmv ?? 0)}</strong>
          </div>
          <button
            className={`filter-btn danger ${filter === "due" ? "active" : ""}`}
            onClick={() => setFilter(filter === "due" ? "all" : "due")}
          >
            <em>Due now</em>
            <strong>{snapshot?.dueNowCount ?? 0}</strong>
          </button>
          <button
            className={`filter-btn ${filter === "approved" ? "active" : ""}`}
            onClick={() => setFilter(filter === "approved" ? "all" : "approved")}
          >
            <em>Approved, not transacting</em>
            <strong>{snapshot?.approvedNotTransactingCount ?? 0}</strong>
          </button>
        </div>
        <div className="topbar-right">
          <input
            className="search"
            placeholder="Search deals…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="toggle">
            <button className={view === "board" ? "active" : ""} onClick={() => setView("board")}>
              Board
            </button>
            <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>
              List
            </button>
          </div>
          <button className="btn primary" onClick={() => setOpenDealId("new")}>
            + Deal
          </button>
          {crmConfig.features.grokChat && (
            <button className="btn" onClick={() => setPanel(panel === "grok" ? "none" : "grok")}>
              Grok
            </button>
          )}
          {crmConfig.features.grokVoice && (
            <button className="btn" onClick={() => setPanel(panel === "voice" ? "none" : "voice")}>
              Voice
            </button>
          )}
          {authRequired && (
            <button className="btn" onClick={() => void logout()}>
              Log out
            </button>
          )}
        </div>
      </header>

      <div className="workspace">
        <main className="main">
          {error && <div className="error">{error}</div>}
          {view === "board" ? (
            <Board deals={visible} onOpen={setOpenDealId} onMove={(id, stage) => void moveDeal(id, stage)} />
          ) : (
            <ListView deals={visible} onOpen={setOpenDealId} />
          )}
        </main>
      </div>

      {openDealId && (
        <DealDrawer
          dealId={openDealId}
          onClose={() => setOpenDealId(null)}
          onChanged={refresh}
        />
      )}
      {panel === "grok" && <GrokChat onClose={() => setPanel("none")} />}
      {panel === "voice" && (
        <VoicePanel
          onClose={() => setPanel("none")}
          onChanged={refresh}
          onOpenDeal={(id) => setOpenDealId(id)}
        />
      )}
    </div>
  );
}
