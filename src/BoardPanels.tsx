import type { Pad } from "./types";
import { pounds, tankState } from "./Yard";
export function StageProgress({ pad }: { pad: Pad }) {
  const well = pad.next?.well ?? pad.wells[0];
  const complete = pad.stage_history.filter(
    (h) => h.well_id === well?.id && !h.short && h.stage > 0,
  ).length;
  return (
    <section className="panel stage-progress">
      <div className="panel-heading">
        <h2>Stage Progress</h2>
        <span>{well?.name ?? "No well configured"}</span>
      </div>
      <div className="stage-overview">
        <strong>
          {complete}
          <small> / {well?.planned_stages ?? 0} stages complete</small>
        </strong>
        <span className="next-stage">
          {pad.next
            ? `${pad.next.well.name} · ${pad.next.stage === 0 ? "Toe" : "Stage " + pad.next.stage}`
            : "Job complete"}
        </span>
      </div>
      <div className="progress-track">
        <span
          style={{
            width:
              Math.min(100, (100 * complete) / (well?.planned_stages || 1)) +
              "%",
          }}
        />
      </div>
      {pad.next?.plans.map((p) => (
        <div className="mesh-progress" key={p.sand_type_id}>
          <div>
            <span>
              {pad.sand_types.find((m) => m.id === p.sand_type_id)?.name}
            </span>
            <span>
              {pounds(p.recorded)} / {pounds(p.required)} lb
            </span>
          </div>
          <div className="progress-track">
            <span
              style={{
                width:
                  Math.min(
                    100,
                    p.required ? (100 * p.recorded) / p.required : 100,
                  ) + "%",
                background: pad.sand_types.find((m) => m.id === p.sand_type_id)
                  ?.color,
              }}
            />
          </div>
        </div>
      ))}
    </section>
  );
}
export function RecentTickets({ pad }: { pad: Pad }) {
  return (
    <section className="panel recent-tickets">
      <div className="panel-heading">
        <h2>Recent Tickets</h2>
        <span>Latest receipts</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ticket / supplier</th>
              <th>Silo</th>
              <th>Sand</th>
              <th>Pounds</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {pad.deliveries.slice(0, 5).map((d) => (
              <tr key={d.id}>
                <td>
                  {d.ticket_number}
                  <small>{d.supplier}</small>
                </td>
                <td>{pad.all_silos.find((s) => s.id === d.silo_id)?.number}</td>
                <td>
                  {pad.sand_types.find((m) => m.id === d.sand_type_id)?.name}
                </td>
                <td>{pounds(d.pounds)}</td>
                <td>{d.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!pad.deliveries.length && <p className="empty">No tickets recorded.</p>}
    </section>
  );
}
export function InventoryAlerts({ pad }: { pad: Pad }) {
  const tanks = pad.silos.filter((s) => tankState(s) !== "ready");
  return (
    <section className="panel inventory-alerts">
      <div className="panel-heading">
        <h2>Inventory Alerts</h2>
        <span>{tanks.length} tank alerts</span>
      </div>
      {tanks.map((s) => (
        <div className={"alert-row " + tankState(s)} key={s.id}>
          <span className={"status-dot " + tankState(s)} />
          <div>
            <strong>
              Silo {s.number} ·{" "}
              {tankState(s) === "offline"
                ? "Offline"
                : tankState(s) === "critical"
                  ? "Critical"
                  : "Low sand"}
            </strong>
            <small>
              {pad.sand_types.find((m) => m.id === s.sand_type_id)?.name} ·{" "}
              {pounds(s.on_hand)} lb · {s.stages_left.toFixed(1)} stages
            </small>
          </div>
        </div>
      ))}
      {pad.totals
        .filter((t) => t.reorder)
        .map((t) => (
          <p className="reserve-alert" key={t.sand_type_id}>
            REORDER · below {pad.settings.reserve} stage reserve ·{" "}
            {pad.sand_types.find((m) => m.id === t.sand_type_id)?.name} (
            {t.stages.toFixed(1)} online stages)
          </p>
        ))}
      {!tanks.length && !pad.totals.some((t) => t.reorder) && (
        <p className="empty">No active inventory alerts.</p>
      )}
      <p className="threshold-note">Low ≤ 25% · Critical ≤ 10% full</p>
    </section>
  );
}
export function Inventory({ pad }: { pad: Pad }) {
  return (
    <main className="inventory-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{pad.pad.name} / DESIGN & BALANCE</p>
          <h1>Inventory</h1>
        </div>
      </div>
      <div className="inventory-meshes">
        {pad.totals.map((t) => {
          const m = pad.sand_types.find((m) => m.id === t.sand_type_id)!,
            d = pad.job_design.find((d) => d.sand_type_id === m.id)!;
          return (
            <section className="panel inventory-mesh" key={m.id}>
              <h2>
                <span className="mesh-key" style={{ background: m.color }} />
                {m.name}
              </h2>
              <strong className="inventory-number">
                {pounds(t.pounds)} <small>lb on hand</small>
              </strong>
              <dl className="readings">
                <dt>Online / available</dt>
                <dd>{pounds(t.available)} lb</dd>
                <dt>Stages available</dt>
                <dd>{t.stages.toFixed(1)}</dd>
                <dt>Per-stage design</dt>
                <dd>{pounds(m.design_pounds)} lb</dd>
                <dt>Planned job pounds</dt>
                <dd>{pounds(d.planned)} lb</dd>
                <dt>Whole-job design</dt>
                <dd>{pounds(d.job_total)} lb</dd>
                <dt>Pumped</dt>
                <dd>{pounds(d.pumped)} lb</dd>
                <dt>Unpumped whole-job design</dt>
                <dd>{pounds(Math.max(0, d.job_total - d.pumped))} lb</dd>
                <dt>On-hand / unpumped design</dt>
                <dd>
                  {d.job_total > d.pumped
                    ? ((100 * t.pounds) / (d.job_total - d.pumped)).toFixed(1) +
                      "%"
                    : "Design met"}
                </dd>
              </dl>
              <div className="mesh-progress">
                <div>
                  <span>Pumped / whole job</span>
                  <span>
                    {d.job_total
                      ? ((100 * d.pumped) / d.job_total).toFixed(1) + "%"
                      : "No total set"}
                  </span>
                </div>
                <div className="progress-track">
                  <span
                    style={{
                      width:
                        Math.min(
                          100,
                          d.job_total ? (100 * d.pumped) / d.job_total : 0,
                        ) + "%",
                      background: m.color,
                    }}
                  />
                </div>
              </div>
              {t.reorder && (
                <p className="reserve-alert">
                  REORDER · below {pad.settings.reserve} stage reserve
                </p>
              )}
            </section>
          );
        })}
      </div>
      <InventoryAlerts pad={pad} />
    </main>
  );
}
export function DailySummary({ pad }: { pad: Pad }) {
  const dates = [
    ...new Set([
      ...pad.deliveries.map((d) => d.date),
      ...pad.runs.map((r) => r.date),
    ]),
  ]
    .sort()
    .reverse();
  return (
    <section className="panel daily-summary">
      <div className="panel-heading">
        <h2>Daily Ledger Totals</h2>
        <span>Active tickets and runs</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Day</th>
              <th>Tickets</th>
              <th>Delivered · lb</th>
              <th>Runs</th>
              <th>Pumped · lb</th>
            </tr>
          </thead>
          <tbody>
            {dates.map((date) => {
              const d = pad.deliveries.filter((d) => d.date === date),
                r = pad.runs.filter((r) => r.date === date);
              return (
                <tr key={date}>
                  <td>{date || "Undated legacy"}</td>
                  <td>{d.length}</td>
                  <td>{pounds(d.reduce((n, d) => n + d.pounds, 0))}</td>
                  <td>{r.length}</td>
                  <td>{pounds(r.reduce((n, r) => n + r.pounds, 0))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
