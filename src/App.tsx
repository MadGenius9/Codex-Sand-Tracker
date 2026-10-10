import { useEffect, useRef, useState } from "react";
import type { Pad, Silo } from "./types";
import { request, setActivePad } from "./api";
import Yard, { pounds } from "./Yard";
import { PullSheet, RecordRun, SiloRail, Tickets } from "./Operations";
import Setup from "./Setup";
import LedgerLog, { StageHistory } from "./LedgerLog";
import {
  StageProgress,
  RecentTickets,
  InventoryAlerts,
  Inventory,
  DailySummary,
} from "./BoardPanels";
type Screen =
  "Board" | "Tickets" | "Stages" | "Inventory" | "Reports" | "Setup";
export default function App() {
  const [pad, setPad] = useState<Pad | null>(null),
    [view, setView] = useState<Pad | null>(null),
    [screen, setScreen] = useState<Screen>("Board"),
    [record, setRecord] = useState(false),
    [selected, setSelected] = useState(3),
    [pull, setPull] = useState<number[]>([]),
    [mesh, setMesh] = useState(1),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [switching, setSwitching] = useState(false);
  const currentPad = useRef(1),
    token = useRef(0);
  useEffect(() => {
    let active = true;
    const id = Number(new URLSearchParams(location.search).get("pad_id") ?? 1);
    request(
      "pad",
      undefined,
      "GET",
      Number.isSafeInteger(id) && id > 0 ? id : 1,
    )
      .then((p) => {
        if (active) {
          setPad(p);
          currentPad.current = p.pad.id;
          setActivePad(p.pad.id);
          setSelected(
            p.silos.find((s) => s.id === 3)?.id ?? p.silos[0]?.id ?? 0,
          );
          setMesh(p.sand_types[0]?.id ?? 0);
        }
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, []);
  function save(p: Pad, msg = "") {
    if (p.pad.id !== currentPad.current) return;
    setPad(p);
    setView(null);
    token.current++;
    setMessage(msg);
    setError("");
    if (view?.next && !(screen === "Stages" && record) && screen !== "Setup")
      preview(view.next.well.id, view.next.stage);
  }
  function activate(p: Pad) {
    token.current++;
    currentPad.current = p.pad.id;
    setActivePad(p.pad.id);
    setPad(p);
    setView(null);
    setSelected(p.silos[0]?.id ?? 0);
    setMesh(p.sand_types[0]?.id ?? 0);
    setPull([]);
    const u = new URL(location.href);
    u.searchParams.set("pad_id", String(p.pad.id));
    history.replaceState(null, "", u);
    setMessage("Opened " + p.pad.name + ".");
    setError("");
  }
  async function switchPad(id: number) {
    setSwitching(true);
    try {
      activate(await request("pad", undefined, "GET", id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSwitching(false);
    }
  }
  async function preview(well_id: number, stage: number) {
    const t = ++token.current;
    try {
      const p = await request("pull-plan", { well_id, stage });
      if (t === token.current && p.pad.id === currentPad.current) {
        setView(p);
        setError("");
      }
    } catch (e) {
      if (t === token.current) setError((e as Error).message);
    }
  }
  function navigate(s: Screen) {
    setScreen(s);
    setRecord(false);
    setPull([]);
    setError("");
    setMessage("");
  }
  function select(s: Silo) {
    setSelected(s.id);
    if (screen === "Stages" && record) {
      if (s.offline) {
        setError("Silo " + s.number + " is offline.");
        return;
      }
      setError("");
      if (mesh !== s.sand_type_id) {
        setMesh(s.sand_type_id);
        setPull([s.id]);
      } else
        setPull((ids) =>
          ids.includes(s.id) ? ids.filter((id) => id !== s.id) : [...ids, s.id],
        );
    }
  }
  const p = view ?? pad,
    silo = p?.silos.find((s) => s.id === selected) ?? p?.silos[0];
  const customer = p?.next?.well.customer.trim() || p?.pad.customer || "";
  const customers = pad
    ? [
        ...new Set(
          [pad.pad.customer, ...pad.wells.map((w) => w.customer)].filter(
            Boolean,
          ),
        ),
      ]
    : [];
  const wellId = p?.next?.well.id ?? pad?.wells[0]?.id ?? 0;
  function chooseWell(id: number) {
    const w = pad?.wells.find((w) => w.id === id);
    if (!w) return;
    const history = pad!.stage_history.filter(
      (h) => h.well_id === id && !h.short,
    );
    let stage = (w.toe_stage ?? pad!.settings.toe_stage) ? 0 : 1;
    while (history.some((h) => h.stage === stage) && stage < w.planned_stages)
      stage++;
    setPull([]);
    preview(id, stage);
  }
  return (
    <div className="app">
      <aside className="sidebar">
        <button
          className="wordmark"
          aria-label="Sand Pad yard"
          onClick={() => navigate("Board")}
        >
          <strong>PYTHON</strong>
          <span>SAND TRACKER</span>
        </button>
        <nav aria-label="Operations">
          {(
            [
              "Board",
              "Tickets",
              "Stages",
              "Inventory",
              "Reports",
              "Setup",
            ] as Screen[]
          ).map((s, i) => (
            <button
              key={s}
              className={screen === s ? "active" : ""}
              aria-current={screen === s ? "page" : undefined}
              onClick={() => navigate(s)}
            >
              <span aria-hidden="true" className="nav-symbol">
                {["▦", "▤", "≋", "▥", "▧", "⚙"][i]}
              </span>
              {s}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="status-dot" /> LOCAL LEDGER
          <span>SQLite · {pad?.silos.length ?? 0} / 6 silos</span>
        </div>
      </aside>
      <div className="shell-main">
        <header className="topbar">
          {pad && (
            <>
              <label>
                Pad
                <select
                  aria-label="Active pad"
                  value={pad.pad.id}
                  disabled={switching}
                  onChange={(e) => switchPad(Number(e.target.value))}
                >
                  {pad.pads.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Job
                <select
                  aria-label="Active job"
                  value={pad.pad.job_name}
                  onChange={async (e) => {
                    try {
                      save(
                        await request(
                          "settings",
                          { job_name: e.target.value },
                          "PUT",
                        ),
                        "Job updated.",
                      );
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  {!pad.pad.job_names.length && (
                    <option value="">Set jobs in Setup</option>
                  )}
                  {pad.pad.job_names.map((j) => (
                    <option key={j}>{j}</option>
                  ))}
                </select>
              </label>
              <label>
                Customer
                <select
                  aria-label="Active customer"
                  value={customer}
                  onChange={(e) => {
                    const w = pad.wells.find(
                      (w) =>
                        (w.customer.trim() || pad.pad.customer) ===
                        e.target.value,
                    );
                    if (w) chooseWell(w.id);
                  }}
                >
                  {!customer && <option value="">Set customer in Setup</option>}
                  {customers.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Well
                <select
                  aria-label="Active well"
                  value={wellId}
                  onChange={(e) => chooseWell(Number(e.target.value))}
                >
                  {pad.wells.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Shift
                <select
                  aria-label="Active shift"
                  value={pad.pad.active_shift}
                  onChange={async (e) => {
                    try {
                      save(
                        await request(
                          "settings",
                          { active_shift: e.target.value },
                          "PUT",
                        ),
                        "Shift updated.",
                      );
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  {!pad.pad.shift_names.length && (
                    <option value="">Set shifts in Setup</option>
                  )}
                  {pad.pad.shift_names.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            </>
          )}
        </header>
        {error && (
          <p className="global-message error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="global-message" role="status">
            {message}
          </p>
        )}
        {!p ? (
          <main className="loading">{error || "Loading local pad…"}</main>
        ) : screen === "Setup" ? (
          <Setup
            key={p.pad.id + ":" + p.pad.job_name + ":" + p.pad.active_shift}
            pad={p}
            onSave={save}
            onActivate={activate}
          />
        ) : screen === "Reports" ? (
          <>
            <DailySummary pad={p} />
            <LedgerLog key={p.pad.id} pad={p} onSave={save} />
          </>
        ) : screen === "Inventory" ? (
          <Inventory pad={p} />
        ) : screen === "Board" ? (
          <main className="board">
            <div className="page-heading">
              <div>
                <p className="eyebrow">BOARD / {p.pad.name}</p>
                <h1>Live Silo Inventory</h1>
              </div>
              <span className="live-label">
                <span className="status-dot" /> Ledger up to date
              </span>
            </div>
            <div className="board-layout">
              <div className="yard-panel panel">
                <Yard pad={p} selected={selected} onSelect={select} />
                {!p.silos.length && (
                  <p className="empty">Add silos in Setup to build the yard.</p>
                )}
              </div>
              <aside className="rail panel">
                {silo && <SiloRail pad={p} silo={silo} />}
              </aside>
              <StageProgress pad={p} />
              <button
                className="receive-action"
                disabled={!silo}
                onClick={() => navigate("Tickets")}
              >
                + Receive sand{" "}
                <span>
                  {silo
                    ? "Silo " + String(silo.number).padStart(2, "0")
                    : "Select a silo"}{" "}
                  →
                </span>
              </button>
              <RecentTickets pad={p} />
              <InventoryAlerts pad={p} />
            </div>
          </main>
        ) : (
          <main className="operation-page">
            <div className="page-heading">
              <div>
                <p className="eyebrow">{p.pad.name} / OPERATIONS</p>
                <h1>{screen === "Stages" ? "Stage Operations" : "Tickets"}</h1>
              </div>
              {screen === "Stages" && (
                <div className="stage-tabs">
                  <button
                    className={!record ? "active" : ""}
                    onClick={() => {
                      setRecord(false);
                      setPull([]);
                    }}
                  >
                    Pull sheet
                  </button>
                  <button
                    className={record ? "active" : ""}
                    onClick={() => setRecord(true)}
                  >
                    Record run
                  </button>
                </div>
              )}
            </div>
            <div className="workspace">
              <div className="yard-panel panel">
                <Yard
                  pad={p}
                  selected={selected}
                  onSelect={select}
                  multi={record ? pull : []}
                />
              </div>
              <aside className="rail operation-rail panel">
                {screen === "Tickets" && silo && (
                  <Tickets key={p.pad.id} pad={p} silo={silo} onSave={save} />
                )}{" "}
                {screen === "Stages" &&
                  (record ? (
                    <RecordRun
                      key={p.pad.id}
                      pad={p}
                      onPlan={preview}
                      mesh={mesh}
                      setMesh={setMesh}
                      selected={pull}
                      setSelected={setPull}
                      onSave={save}
                    />
                  ) : (
                    <PullSheet pad={p} />
                  ))}
              </aside>
            </div>
            {screen === "Tickets" ? (
              <RecentTickets pad={p} />
            ) : (
              <div className="panel stage-history-panel">
                <StageHistory pad={p} />
              </div>
            )}
          </main>
        )}
      </div>
    </div>
  );
}
