import { useEffect, useState, useRef } from "react";
import type { Pad, Silo } from "./types";
import { request, setActivePad } from "./api";
import Yard, { pounds } from "./Yard";
import { PullSheet, RecordRun, SiloRail, Tickets } from "./Operations";
import Setup from "./Setup";
import LedgerLog from "./LedgerLog";
type Screen = "Pad" | "Tickets" | "Pull sheet" | "Record run" | "Setup" | "Log";
export default function App() {
  const [pad, setPad] = useState<Pad | null>(null);
  const [screen, setScreen] = useState<Screen>("Pad");
  const [selected, setSelected] = useState(3);
  const [pull, setPull] = useState<number[]>([]);
  const [mesh, setMesh] = useState(1);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [switching, setSwitching] = useState(false);
  const currentPad = useRef(1);
  useEffect(() => {
    let active = true;
    const requested = Number(
      new URLSearchParams(window.location.search).get("pad_id") ?? 1,
    );
    request(
      "pad",
      undefined,
      "GET",
      Number.isSafeInteger(requested) && requested > 0 ? requested : 1,
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
    setMessage(msg);
    setError("");
  }
  function activate(p: Pad) {
    const url = new URL(window.location.href);
    url.searchParams.set("pad_id", String(p.pad.id));
    window.history.replaceState(null, "", url);
    currentPad.current = p.pad.id;
    setActivePad(p.pad.id);
    setPad(p);
    setSelected(p.silos[0]?.id ?? 0);
    setMesh(p.sand_types[0]?.id ?? 0);
    setPull([]);
    setError("");
    setMessage(`Opened ${p.pad.name}.`);
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
  function select(s: Silo) {
    setSelected(s.id);
    setMessage("");
    if (screen === "Record run") {
      if (s.offline) {
        setError(`Silo ${s.number} is offline.`);
        return;
      }
      setError("");
      if (s.sand_type_id !== mesh) {
        setMesh(s.sand_type_id);
        setPull([s.id]);
      } else
        setPull((ids) =>
          ids.includes(s.id) ? ids.filter((id) => id !== s.id) : [...ids, s.id],
        );
    }
  }
  const silo = pad?.silos.find((s) => s.id === selected) ?? pad?.silos[0];
  return (
    <div className="app">
      <header className="app-header">
        <button
          className={`home ${screen === "Pad" ? "active" : ""}`}
          onClick={() => {
            setScreen("Pad");
            setError("");
            setMessage("");
          }}
          aria-label="Sand Pad yard"
        >
          Sand Pad
        </button>
        {pad && (
          <label className="pad-selector">
            <span className="sr-only">Active pad</span>
            <select
              aria-label="Active pad"
              value={pad.pad.id}
              disabled={switching}
              onChange={(e) => switchPad(Number(e.target.value))}
            >
              {pad.pads.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <nav aria-label="Operations">
          {(
            ["Tickets", "Pull sheet", "Record run", "Log", "Setup"] as Screen[]
          ).map((name) => (
            <button
              key={name}
              className={screen === name ? "active" : ""}
              aria-current={screen === name ? "page" : undefined}
              onClick={() => {
                setScreen(name);
                setError("");
                setMessage("");
                setPull([]);
              }}
            >
              {name}
            </button>
          ))}
        </nav>
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
      {!pad ? (
        <main className="loading">
          {error
            ? "Unable to load the local API. Start Sand Pad with npm run dev."
            : "Loading pad…"}
        </main>
      ) : screen === "Setup" ? (
        <Setup key={pad.pad.id} pad={pad} onSave={save} onActivate={activate} />
      ) : screen === "Log" ? (
        <LedgerLog key={pad.pad.id} pad={pad} onSave={save} />
      ) : (
        <>
          <main className="workspace" key={pad.pad.id}>
            <Yard
              pad={pad}
              selected={selected}
              onSelect={select}
              multi={screen === "Record run" ? pull : []}
            />
            {!pad.silos.length && (
              <p className="empty empty-yard">
                This pad has no silos. Add wells, meshes and silos in Setup.
              </p>
            )}
            <aside
              className={`rail ${screen === "Pad" ? "silo-rail" : "operation-rail"}`}
              aria-label={screen === "Pad" ? "Selected silo" : screen}
            >
              {screen === "Pad" && silo && <SiloRail pad={pad} silo={silo} />}{" "}
              {screen === "Tickets" && silo && (
                <Tickets pad={pad} silo={silo} onSave={save} />
              )}{" "}
              {screen === "Pull sheet" && <PullSheet pad={pad} />}{" "}
              {screen === "Record run" && (
                <RecordRun
                  pad={pad}
                  mesh={mesh}
                  setMesh={setMesh}
                  selected={pull}
                  setSelected={setPull}
                  onSave={save}
                />
              )}
            </aside>
          </main>
          <footer className="pad-footer">
            {pad.totals.map((t) => (
              <div key={t.sand_type_id}>
                <span>
                  {pad.sand_types.find((m) => m.id === t.sand_type_id)?.name} ·
                  ONLINE
                </span>
                <strong>
                  {pounds(t.available)} <small>lb</small>{" "}
                  <span>{t.stages.toFixed(1)} stages</span>
                </strong>
                {t.reorder && (
                  <p className="low">
                    REORDER · below {pad.settings.reserve} stage reserve
                  </p>
                )}
              </div>
            ))}
            <div className="next-stage">
              <span>NEXT STAGE</span>
              <strong>
                {pad.next
                  ? `${pad.next.well.name} · ${pad.next.stage}`
                  : "Pad complete"}
              </strong>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
