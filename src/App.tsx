import { useEffect, useState } from "react";
import type { Pad, Silo } from "./types";
import { request } from "./api";
import Yard, { pounds } from "./Yard";
import { PullSheet, RecordRun, SiloRail, Tickets } from "./Operations";
import Setup from "./Setup";
type Screen = "Pad" | "Tickets" | "Pull sheet" | "Record run" | "Setup";
export default function App() {
  const [pad, setPad] = useState<Pad | null>(null);
  const [screen, setScreen] = useState<Screen>("Pad");
  const [selected, setSelected] = useState(3);
  const [pull, setPull] = useState<number[]>([]);
  const [mesh, setMesh] = useState(1);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    request("pad")
      .then((p) => {
        if (active) {
          setPad(p);
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
    setPad(p);
    setMessage(msg);
    setError("");
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
        <nav aria-label="Operations">
          {(["Tickets", "Pull sheet", "Record run", "Setup"] as Screen[]).map(
            (name) => (
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
            ),
          )}
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
        <Setup pad={pad} onSave={save} />
      ) : (
        <>
          <main className="workspace">
            <Yard
              pad={pad}
              selected={selected}
              onSelect={select}
              multi={screen === "Record run" ? pull : []}
            />
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
