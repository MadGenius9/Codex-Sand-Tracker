import { useState, useEffect, type FormEvent } from "react";
import type { Pad, Silo } from "./types";
import { ApiError, request, today } from "./api";
import { Tank, pounds } from "./Yard";
import { DrawOrderNote } from "./CustomerOrders";
type Save = (p: Pad, message?: string) => void;
export function SiloRail({ pad, silo }: { pad: Pad; silo: Silo }) {
  const mesh = pad.sand_types.find((m) => m.id === silo.sand_type_id)!;
  return (
    <>
      <h1>Silo {String(silo.number).padStart(2, "0")}</h1>
      {silo.name && <p className="muted">{silo.name}</p>}
      <p className="muted">
        {(silo.on_hand / pad.settings.pounds_per_ton).toFixed(1)} tons ·{" "}
        {(silo.on_hand / pad.settings.pounds_per_truckload).toFixed(1)}{" "}
        truckloads
      </p>
      <div className="rail-tank">
        <Tank silo={silo} color={mesh.color} />
      </div>
      <dl className="readings">
        <dt>Mesh</dt>
        <dd>{mesh.name}</dd>
        <dt>On-hand</dt>
        <dd>
          {pounds(silo.on_hand)} <small>lb</small>
        </dd>
        <dt>Capacity</dt>
        <dd>
          {pounds(silo.capacity)} <small>lb</small>
        </dd>
      </dl>
      <dl className="readings divided">
        <dt>Run order</dt>
        <dd>
          {silo.offline ? "Offline" : (silo.run_order ?? "—")}
          {silo.manual_pin !== null && <small> · pin {silo.manual_pin}</small>}
        </dd>
        <dt>Planned pull</dt>
        <dd>
          {pounds(silo.planned_pull)} <small>lb</small>
        </dd>
        <dt>Stages left</dt>
        <dd>{silo.stages_left.toFixed(1)}</dd>
      </dl>
      {silo.pin_conflict && (
        <p className="error">
          Manual pin conflict: another online {mesh.name} silo shares pin{" "}
          {silo.manual_pin}. Change one pin in Setup.
        </p>
      )}
      {!!silo.offline && (
        <p className="muted">Offline silos are excluded from planned pulls.</p>
      )}
      <p className="rail-note">Starting balance + deliveries − runs</p>
      <DrawOrderNote pad={pad} />
    </>
  );
}
export function Tickets({
  pad,
  silo,
  onSave,
}: {
  pad: Pad;
  silo: Silo;
  onSave: Save;
}) {
  const [supplier, setSupplier] = useState(pad.suppliers[0]?.name ?? "__new");
  const [newSupplier, setNewSupplier] = useState("");
  const [ticket, setTicket] = useState("");
  const [product, setProduct] = useState("");
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState(today());
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverDuplicate, setServerDuplicate] = useState(false);
  const [remember, setRemember] = useState(true);
  const mapping = pad.product_map.find(
    (m) => m.product_code.toLowerCase() === product.trim().toLowerCase(),
  );
  const ticketMesh = mapping?.sand_type_id ?? silo.sand_type_id;
  const mismatch = ticketMesh !== silo.sand_type_id;
  const exists =
    serverDuplicate ||
    pad.deliveries.some(
      (d) => d.ticket_number.toLowerCase() === ticket.trim().toLowerCase(),
    );
  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await request("deliveries", {
        supplier: supplier === "__new" ? newSupplier : supplier,
        ticket_number: ticket,
        product_code: product,
        pounds: Number(weight),
        date,
        silo_id: silo.id,
        sand_type_id: ticketMesh,
        remember_product: remember,
        confirm_duplicate: duplicate,
      });
      onSave(
        result,
        `Ticket ${ticket} saved · Silo ${silo.number} now ${pounds(result.silos.find((s) => s.id === silo.id)!.on_hand)} lb`,
      );
      setTicket("");
      setWeight("");
      setDuplicate(false);
      setServerDuplicate(false);
    } catch (err) {
      setError((err as Error).message);
      if (err instanceof ApiError && err.status === 409) {
        setDuplicate(false);
        setServerDuplicate(true);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Tickets</h1>
      <p className="muted">
        Receiving into Silo {String(silo.number).padStart(2, "0")} · Side{" "}
        {silo.side}
      </p>
      <form onSubmit={save}>
        <label>
          Supplier
          <select
            aria-label="Supplier"
            required
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
          >
            {pad.suppliers.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
            <option value="__new">Add a new supplier…</option>
          </select>
        </label>
        {supplier === "__new" && (
          <label>
            New supplier
            <input
              required
              maxLength={200}
              value={newSupplier}
              onChange={(e) => setNewSupplier(e.target.value)}
            />
          </label>
        )}
        <label>
          Ticket number
          <input
            required
            value={ticket}
            onChange={(e) => {
              setTicket(e.target.value);
              setDuplicate(false);
              setServerDuplicate(false);
            }}
            maxLength={200}
          />
        </label>
        {exists && (
          <label className="duplicate">
            <span className="low">This ticket number already exists.</span>
            <span>
              <input
                type="checkbox"
                checked={duplicate}
                onChange={(e) => setDuplicate(e.target.checked)}
              />{" "}
              Save another delivery with this number
            </span>
          </label>
        )}
        <label>
          Mesh
          <select aria-label="Mesh" value={ticketMesh} disabled>
            {pad.sand_types.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        {mapping && (
          <p className={mismatch ? "error" : "muted"}>
            {mismatch
              ? "Mapped mesh does not match this silo. Select a tank assigned to the mapped mesh."
              : "Mesh filled from mine code."}
          </p>
        )}
        <label className="check-label">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />{" "}
          Save this mine code for the next ticket
        </label>
        <label>
          Product code
          <input
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            maxLength={200}
          />
        </label>
        <div className="field-pair">
          <label>
            Pounds
            <input
              required
              type="number"
              min="1"
              step="1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </label>
          <label>
            Date
            <input
              required
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary"
          disabled={busy || mismatch || (exists && !duplicate)}
        >
          {busy ? "Saving…" : "Save delivery"}
        </button>
      </form>
      <button
        className="text-button"
        onClick={() => setWeight(String(pad.settings.pounds_per_truckload))}
      >
        Use truckload · {pounds(pad.settings.pounds_per_truckload)} lb
      </button>
      <h2 className="section-title">Today’s tickets</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ticket / supplier</th>
              <th>Silo</th>
              <th>Pounds</th>
            </tr>
          </thead>
          <tbody>
            {pad.deliveries
              .filter((d) => d.date === today())
              .map((d) => (
                <tr key={d.id}>
                  <td>
                    {d.ticket_number}
                    <small>
                      {d.supplier} ·{" "}
                      {
                        pad.sand_types.find((m) => m.id === d.sand_type_id)
                          ?.name
                      }
                    </small>
                  </td>
                  <td>
                    {pad.all_silos.find((s) => s.id === d.silo_id)?.number}
                  </td>
                  <td>{pounds(d.pounds)}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {!pad.deliveries.some((d) => d.date === today()) && (
          <p className="muted">No tickets today.</p>
        )}
      </div>
    </>
  );
}
export function PullSheet({ pad }: { pad: Pad }) {
  return (
    <>
      <div className="rail-heading">
        <h1>Pull sheet</h1>
        <button onClick={() => window.print()} className="text-button">
          Print
        </button>
      </div>
      <section className="print-sheet">
        <DrawOrderNote pad={pad} />
        <h2 className="print-only">Sand Pad · Pull sheet</h2>
        {pad.next ? (
          <>
            <div className="sheet-heading">
              <h2>{pad.next.well.name}</h2>
              <p>{pad.next.well.customer}</p>
              <strong>
                {pad.next.stage === 0 ? "Toe stage" : "Stage " + pad.next.stage}{" "}
                <span className="muted">/ {pad.next.well.planned_stages}</span>
              </strong>
            </div>
            {pad.next.plans.map((p) => (
              <section key={p.sand_type_id} className="mesh-sheet">
                <h3>
                  {pad.sand_types.find((m) => m.id === p.sand_type_id)?.name}
                </h3>
                <p className="muted">
                  Design {pounds(p.required)} lb · Recorded {pounds(p.recorded)}{" "}
                  lb
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Silo</th>
                      <th>Pull · lb</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.pulls.map((item) => {
                      const s = pad.silos.find((s) => s.id === item.silo_id)!;
                      return (
                        <tr key={s.id}>
                          <td>{s.run_order}</td>
                          <td>
                            {String(s.number).padStart(2, "0")} · {s.side}
                          </td>
                          <td>{pounds(item.pounds)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}>Planned total</td>
                      <td>
                        {pounds(p.pulls.reduce((n, s) => n + s.pounds, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                {p.remaining === 0 && <p>Mesh complete for this stage.</p>}
                {p.shortfall > 0 && (
                  <p className="error">
                    Shortfall: {pounds(p.shortfall)} lb. Receive sand or bring a
                    stocked silo online.
                  </p>
                )}
              </section>
            ))}
            <p className="sheet-total">
              Stage remaining{" "}
              <strong>
                {pounds(pad.next.plans.reduce((n, p) => n + p.remaining, 0))} lb
              </strong>
            </p>
          </>
        ) : (
          <p>
            All planned stages are complete. Add a well or increase the planned
            count in Setup.
          </p>
        )}
      </section>
    </>
  );
}
export function RecordRun({
  pad,
  mesh,
  setMesh,
  selected,
  setSelected,
  onSave,
  onPlan,
}: {
  pad: Pad;
  mesh: number;
  setMesh: (id: number) => void;
  selected: number[];
  setSelected: (ids: number[]) => void;
  onSave: Save;
  onPlan: (well: number, stage: number) => void;
}) {
  const [well, setWell] = useState(pad.next?.well.id ?? pad.wells[0]?.id ?? 0);
  const [stage, setStage] = useState(pad.next?.stage ?? 1);
  const [weights, setWeights] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [runDate, setRunDate] = useState(today());
  useEffect(() => {
    if (pad.next) {
      setWell(pad.next.well.id);
      setStage(pad.next.stage);
      setWeights({});
    }
  }, [pad.next?.well.id, pad.next?.stage]);
  const [changes, setChanges] = useState<
    { silo_id: number; before: number; after: number }[]
  >([]);
  const plan =
    pad.next?.well.id === well && pad.next.stage === stage
      ? pad.next.plans.find((p) => p.sand_type_id === mesh)
      : undefined;
  const amount = (s: Silo) =>
    weights[s.id] ??
    String(
      plan?.pulls.find((p) => p.silo_id === s.id)?.pounds ??
        Math.min(
          s.on_hand,
          pad.wells
            .find((w) => w.id === well)
            ?.overrides.find((d) => d.sand_type_id === mesh)?.pounds ??
            pad.sand_types.find((m) => m.id === mesh)?.design_pounds ??
            0,
        ),
    );
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await request<{ pad: Pad; changes: typeof changes }>("runs", {
        well_id: well,
        date: runDate,
        stage,
        sand_type_id: mesh,
        entries: selected.map((id) => ({
          silo_id: id,
          pounds: Number(amount(pad.silos.find((s) => s.id === id)!)),
        })),
      });
      setChanges(r.changes);
      onSave(r.pad, "Run recorded. Yard balances updated.");
      setSelected([]);
      setWeights({});
      setWell(r.pad.next?.well.id ?? well);
      setStage(r.pad.next?.stage ?? stage);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Record run</h1>
      <DrawOrderNote pad={pad} />
      <p className="muted">Click online tanks to build the pull.</p>
      <form onSubmit={save}>
        <label>
          Run date
          <input
            required
            type="date"
            value={runDate}
            onChange={(e) => setRunDate(e.target.value)}
          />
        </label>
        <label>
          Well
          <select
            value={well}
            onChange={(e) => {
              const w = pad.wells.find((w) => w.id === Number(e.target.value))!;
              setWell(w.id);
              const stage = (w.toe_stage ?? pad.settings.toe_stage) ? 0 : 1;
              setStage(stage);
              onPlan(w.id, stage);
              setWeights({});
            }}
          >
            {pad.wells.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <div className="field-pair">
          <label>
            Stage
            <input
              type="number"
              min={
                (pad.wells.find((w) => w.id === well)?.toe_stage ??
                pad.settings.toe_stage)
                  ? 0
                  : 1
              }
              max={pad.wells.find((w) => w.id === well)?.planned_stages}
              required
              value={stage}
              onChange={(e) => {
                setStage(Number(e.target.value));
                setWeights({});
                onPlan(well, Number(e.target.value));
              }}
            />
          </label>
          <label>
            Mesh
            <select
              value={mesh}
              onChange={(e) => {
                setMesh(Number(e.target.value));
                setSelected([]);
                setWeights({});
              }}
            >
              {pad.sand_types.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="run-entries">
          {selected.map((id) => {
            const s = pad.silos.find((s) => s.id === id)!;
            return (
              <label key={id}>
                Silo {String(s.number).padStart(2, "0")} · {pounds(s.on_hand)}{" "}
                lb available
                <input
                  aria-label={`Pounds from silo ${s.number}`}
                  type="number"
                  required
                  min="1"
                  max={s.on_hand}
                  step="1"
                  value={amount(s)}
                  onChange={(e) =>
                    setWeights({ ...weights, [id]: e.target.value })
                  }
                />
              </label>
            );
          })}
        </div>
        {!selected.length && (
          <p className="empty">Select a tank in the yard.</p>
        )}
        <p className="sheet-total">
          Total pull{" "}
          <strong>
            {pounds(
              selected.reduce(
                (n, id) =>
                  n + Number(amount(pad.silos.find((s) => s.id === id)!)),
                0,
              ),
            )}{" "}
            lb
          </strong>
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy || !selected.length}>
          {busy ? "Saving…" : "Save run"}
        </button>
      </form>
      {changes.length > 0 && (
        <section className="run-result" aria-live="polite">
          <h2 className="section-title">Recorded balances</h2>
          {changes.map((c) => (
            <p key={c.silo_id}>
              Silo {pad.silos.find((s) => s.id === c.silo_id)?.number}
              <strong>
                {pounds(c.before)} → {pounds(c.after)} lb
              </strong>
            </p>
          ))}
        </section>
      )}
    </>
  );
}
