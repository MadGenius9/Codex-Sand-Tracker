import { useState, type FormEvent } from "react";
import type { Pad, Delivery, Run } from "./types";
import { request, ApiError, today } from "./api";
import { pounds } from "./Yard";
type Entry =
  { kind: "deliveries"; record: Delivery } | { kind: "runs"; record: Run };
export default function LedgerLog({
  pad,
  onSave,
}: {
  pad: Pad;
  onSave: (p: Pad, message?: string) => void;
}) {
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [filter, setFilter] = useState("all");
  const [edit, setEdit] = useState<Entry | null>(null),
    [draft, setDraft] = useState<Record<string, string | number | null>>({});
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [serverDuplicate, setServerDuplicate] = useState(false),
    [confirmVoid, setConfirmVoid] = useState(false);
  const entries: Entry[] = [
    ...pad.ledger.deliveries.map((record) => ({
      kind: "deliveries" as const,
      record,
    })),
    ...pad.ledger.runs.map((record) => ({ kind: "runs" as const, record })),
  ];
  entries.sort(
    (a, b) =>
      b.record.date.localeCompare(a.record.date) || b.record.id - a.record.id,
  );
  function open(e: Entry) {
    setEdit(e);
    setDraft({ ...e.record } as unknown as typeof draft);
    setConfirm(false);
    setServerDuplicate(false);
    setConfirmVoid(false);
    setError("");
  }
  const set = (key: string, v: string | number | null) =>
    setDraft({ ...draft, [key]: v });
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setBusy(true);
    setError("");
    try {
      onSave(
        await request(
          `${edit.kind}/${edit.record.id}`,
          { ...draft, confirm_duplicate: confirm },
          "PUT",
        ),
        "Record edited. Yard balances recomputed.",
      );
      setEdit(null);
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status === 409) {
        setConfirm(false);
        setServerDuplicate(true);
      }
    } finally {
      setBusy(false);
    }
  }
  async function voidRecord() {
    if (!edit) return;
    setBusy(true);
    setError("");
    try {
      onSave(
        await request(`${edit.kind}/${edit.record.id}/void`, {}),
        "Record voided. Yard balances recomputed.",
      );
      setEdit(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const matched = entries.filter(
    (e) =>
      (filter === "all" || e.kind === filter) &&
      (!from || e.record.date >= from) &&
      (!to || e.record.date <= to),
  );
  const duplicates =
    edit?.kind === "deliveries" &&
    pad.deliveries.some(
      (d) =>
        d.id !== edit.record.id &&
        d.ticket_number.toLowerCase() ===
          String(draft.ticket_number).trim().toLowerCase(),
    );
  return (
    <main className="setup ledger-screen">
      <h1>Log</h1>
      <p className="muted">
        {pad.pad.name} · Delivery tickets and runs. Voided entries stay in the
        log and are excluded from inventory.
      </p>
      <div className="log-filters">
        <label>
          From date
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Through date
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label>
          Records
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Tickets and runs</option>
            <option value="deliveries">Tickets</option>
            <option value="runs">Runs</option>
          </select>
        </label>
      </div>
      <div className="ledger-layout">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Record</th>
                <th>Silo / mesh</th>
                <th>Well / stage</th>
                <th>Pounds</th>
                <th>Status / action</th>
              </tr>
            </thead>
            <tbody>
              {matched.map((e) => (
                <tr
                  key={`${e.kind}-${e.record.id}`}
                  className={e.record.voided_at ? "voided" : ""}
                >
                  <td>{e.record.date || "Undated legacy"}</td>
                  <td>
                    {e.kind === "deliveries"
                      ? e.record.ticket_number
                      : `Run #${e.record.id}`}
                    <small>
                      {e.kind === "deliveries"
                        ? `${e.record.supplier} · ${e.record.product_code}`
                        : "Run"}
                    </small>
                  </td>
                  <td>
                    {
                      pad.all_silos.find((s) => s.id === e.record.silo_id)
                        ?.number
                    }
                    <small>
                      {
                        pad.sand_types.find(
                          (m) => m.id === e.record.sand_type_id,
                        )?.name
                      }
                    </small>
                  </td>
                  <td>
                    {e.kind === "runs" ? (
                      <>
                        {
                          pad.all_wells.find((w) => w.id === e.record.well_id)
                            ?.name
                        }
                        <small>
                          {e.record.stage === 0
                            ? "Toe stage"
                            : "Stage " + e.record.stage}
                        </small>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{pounds(e.record.pounds)}</td>
                  <td>
                    {e.record.voided_at ? (
                      "Voided"
                    ) : (
                      <button
                        className="text-button"
                        onClick={() => open(e)}
                        aria-label={`Edit ${e.kind === "deliveries" ? "ticket " + e.record.ticket_number : "run " + e.record.id}`}
                      >
                        Edit / void
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!matched.length && (
            <p className="empty">No records in this date range.</p>
          )}
        </div>
        {edit && (
          <section className="ledger-editor">
            <h2>
              {edit.kind === "deliveries" ? "Edit delivery" : "Edit run"} #
              {edit.record.id}
            </h2>
            <form onSubmit={save}>
              <label>
                Date
                <input
                  required
                  type="date"
                  value={String(draft.date ?? "")}
                  onChange={(e) => set("date", e.target.value)}
                />
              </label>
              {!draft.date && (
                <p className="muted">
                  Legacy runs had no date. Enter the actual run date when
                  editing.
                </p>
              )}
              {edit.kind === "deliveries" ? (
                <>
                  <label>
                    Supplier
                    <input
                      required
                      value={String(draft.supplier)}
                      onChange={(e) => set("supplier", e.target.value)}
                    />
                  </label>
                  <label>
                    Ticket number
                    <input
                      required
                      value={String(draft.ticket_number)}
                      onChange={(e) => {
                        set("ticket_number", e.target.value);
                        setConfirm(false);
                        setServerDuplicate(false);
                      }}
                    />
                  </label>
                  <label>
                    Product code
                    <input
                      value={String(draft.product_code)}
                      onChange={(e) => set("product_code", e.target.value)}
                    />
                  </label>
                  {(duplicates || serverDuplicate) && (
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={confirm}
                        onChange={(e) => setConfirm(e.target.checked)}
                      />{" "}
                      Confirm duplicate ticket number
                    </label>
                  )}
                </>
              ) : (
                <>
                  <label>
                    Well
                    <select
                      value={Number(draft.well_id)}
                      onChange={(e) => set("well_id", Number(e.target.value))}
                    >
                      {pad.all_wells.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Stage
                    <input
                      required
                      type="number"
                      min="0"
                      max={
                        pad.all_wells.find((w) => w.id === draft.well_id)
                          ?.planned_stages
                      }
                      value={Number(draft.stage)}
                      onChange={(e) => set("stage", Number(e.target.value))}
                    />
                  </label>
                </>
              )}
              <label>
                Silo
                <select
                  value={Number(draft.silo_id)}
                  onChange={(e) => {
                    const s = pad.all_silos.find(
                      (s) => s.id === Number(e.target.value),
                    )!;
                    setDraft({
                      ...draft,
                      silo_id: s.id,
                      sand_type_id: s.sand_type_id,
                    });
                  }}
                >
                  {pad.all_silos.map((s) => (
                    <option key={s.id} value={s.id}>
                      Silo {s.number} ·{" "}
                      {
                        pad.sand_types.find((m) => m.id === s.sand_type_id)
                          ?.name
                      }
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Mesh
                <select disabled value={Number(draft.sand_type_id)}>
                  {pad.sand_types.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Pounds
                <input
                  required
                  type="number"
                  min="1"
                  step="any"
                  value={Number(draft.pounds)}
                  onChange={(e) => set("pounds", Number(e.target.value))}
                />
              </label>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="form-actions">
                <button
                  className="primary"
                  disabled={
                    busy || ((!!duplicates || serverDuplicate) && !confirm)
                  }
                >
                  Save changes
                </button>
                <button
                  className="text-button"
                  type="button"
                  disabled={busy}
                  onClick={() => setEdit(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
            <div className="void-action">
              {confirmVoid ? (
                <>
                  <p>
                    Void this record? It will stay in the log but no longer
                    affect inventory or stage completion.
                  </p>
                  <button
                    className="text-button error"
                    disabled={busy}
                    onClick={voidRecord}
                  >
                    Confirm void
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => setConfirmVoid(false)}
                  >
                    Keep record
                  </button>
                </>
              ) : (
                <button
                  className="text-button error"
                  disabled={busy}
                  onClick={() => setConfirmVoid(true)}
                >
                  Void record
                </button>
              )}
            </div>
          </section>
        )}
      </div>
      <StageHistory pad={pad} />
    </main>
  );
}
export function StageHistory({ pad }: { pad: Pad }) {
  const [well, setWell] = useState(0);
  const history = pad.stage_history.filter((h) => !well || h.well_id === well);
  return (
    <section className="setup-section">
      <div className="rail-heading">
        <h2>Stage history</h2>
        <label className="history-filter">
          Well
          <select
            value={well}
            onChange={(e) => setWell(Number(e.target.value))}
          >
            <option value="0">All wells</option>
            {pad.all_wells.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted">
        Pumped pounds exclude voids. Short means one or more meshes are below
        their stage design, including partial stages.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Well / stage</th>
              <th>Mesh</th>
              <th>Pumped · lb</th>
              <th>Design · lb</th>
              <th>Difference · lb</th>
              <th>Stage status</th>
            </tr>
          </thead>
          <tbody>
            {history.flatMap((h) =>
              h.meshes.map((m) => (
                <tr key={`${h.well_id}-${h.stage}-${m.sand_type_id}`}>
                  <td>
                    {pad.all_wells.find((w) => w.id === h.well_id)?.name}
                    <small>
                      {h.stage === 0 ? "Toe stage" : "Stage " + h.stage}
                    </small>
                  </td>
                  <td>
                    {pad.sand_types.find((s) => s.id === m.sand_type_id)?.name}
                  </td>
                  <td>{pounds(m.pumped)}</td>
                  <td>{pounds(m.design)}</td>
                  <td className={m.short ? "low" : ""}>
                    {pounds(m.pumped - m.design)}
                  </td>
                  <td className={h.short ? "low" : ""}>
                    {h.short ? "Short" : "Met design"}
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
        {!history.length && (
          <p className="empty">No stages recorded for this well.</p>
        )}
      </div>
    </section>
  );
}
