import { useState, type FormEvent } from "react";
import type { Pad } from "./types";
import { request } from "./api";
import { pounds } from "./Yard";
import { NewPad, ProductMap, DatabaseDownload, Suppliers } from "./PadTools";
import CustomerOrders from "./CustomerOrders";
type Entity = "wells" | "sand_types" | "silos";
type Draft = { id?: number; [key: string]: any };
function Editor({
  entity,
  pad,
  onSave,
}: {
  entity: Entity;
  pad: Pad;
  onSave: (p: Pad) => void;
}) {
  const [edit, setEdit] = useState<Draft | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const fields =
    entity === "wells"
      ? ["name", "customer", "planned_stages", "toe_stage"]
      : entity === "sand_types"
        ? ["name", "design_pounds", "job_total"]
        : [
            "number",
            "name",
            "side",
            "sand_type_id",
            "capacity",
            "starting_balance",
            "manual_pin",
            "offline",
          ];
  const labels: Record<string, string> = {
    name: "Name",
    customer: "Customer",
    planned_stages: "Planned stages",
    toe_stage: "Toe stage",
    design_pounds: "Design lb / stage",
    job_total: "Whole-job design · lb",
    number: "Number",
    side: "Side",
    sand_type_id: "Mesh",
    capacity: "Capacity · lb",
    starting_balance: "Starting balance · lb",
    manual_pin: "Manual order pin",
    offline: "Offline",
  };
  const defaults =
    entity === "wells"
      ? {
          name: "",
          customer: pad.pad.customer,
          planned_stages: 40,
          toe_stage: null,
          overrides: [],
        }
      : entity === "sand_types"
        ? { name: "", design_pounds: 80000, job_total: 0 }
        : {
            number: Math.max(0, ...pad.all_silos.map((s) => s.number)) + 1,
            name: "",
            side: "A",
            sand_type_id: pad.sand_types[0]?.id ?? 0,
            capacity: 250000,
            starting_balance: 0,
            manual_pin: null,
            offline: 0,
          };
  const set = (f: string, v: any) => setEdit({ ...edit, [f]: v });
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onSave(await request("setup/" + entity, edit));
      setEdit(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(row: Draft) {
    const history =
      entity === "silos"
        ? pad.ledger.deliveries.some((d) => d.silo_id === row.id) ||
          pad.ledger.runs.some((r) => r.silo_id === row.id)
        : pad.ledger.runs.some((r) => r.well_id === row.id);
    if (
      !window.confirm(
        history
          ? "This " +
              (entity === "silos"
                ? "silo has tickets or runs"
                : "well has runs") +
              ". Remove it from the active job? All ledger rows will be retained."
          : "Remove this " +
              (entity === "silos" ? "silo" : "well") +
              " from the job?",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      onSave(
        await request(
          "setup/" + entity + "/" + row.id,
          { confirm_history: history },
          "DELETE",
        ),
      );
      setEdit(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="setup-section">
      <div className="rail-heading">
        <h2>
          {entity === "sand_types"
            ? "Job design"
            : entity === "wells"
              ? "Wells"
              : "Silos"}
        </h2>
        <button
          className="text-button"
          disabled={entity === "silos" && pad.silos.length >= 6}
          onClick={() => {
            setEdit(defaults);
            setError("");
          }}
        >
          Add{" "}
          {entity === "sand_types"
            ? "sand type"
            : entity === "wells"
              ? "well"
              : "silo"}
        </button>
      </div>
      {entity === "silos" && (
        <p className="muted">
          {pad.silos.length} / 6 active silos · Remove a silo to free a slot.
          Ledger history is retained.
        </p>
      )}
      {entity === "sand_types" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mesh</th>
                <th>Planned · lb</th>
                <th>Job total · lb</th>
                <th>Plan − job · lb</th>
                <th>Pumped · lb</th>
                <th>Pumped / planned</th>
                <th>Pumped / job</th>
              </tr>
            </thead>
            <tbody>
              {pad.job_design.map((d) => (
                <tr key={d.sand_type_id}>
                  <td>
                    {pad.sand_types.find((m) => m.id === d.sand_type_id)?.name}
                  </td>
                  <td>{pounds(d.planned)}</td>
                  <td>{pounds(d.job_total)}</td>
                  <td>{pounds(d.planned - d.job_total)}</td>
                  <td>{pounds(d.pumped)}</td>
                  <td>
                    {d.planned
                      ? ((100 * d.pumped) / d.planned).toFixed(1) + "%"
                      : "—"}
                  </td>
                  <td>
                    {d.job_total
                      ? ((100 * d.pumped) / d.job_total).toFixed(1) + "%"
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {fields.map((f) => (
                <th key={f}>{labels[f]}</th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(pad[entity] as unknown as Draft[]).map((row) => (
              <tr key={row.id}>
                {fields.map((f) => (
                  <td key={f}>
                    {f === "sand_type_id"
                      ? pad.sand_types.find((m) => m.id === row[f])?.name
                      : f === "toe_stage"
                        ? row[f] === null
                          ? "Pad default"
                          : row[f]
                            ? "Yes"
                            : "No"
                        : f === "offline"
                          ? row[f]
                            ? "Yes"
                            : "No"
                          : f === "manual_pin"
                            ? (row[f] ?? "Auto")
                            : [
                                  "capacity",
                                  "starting_balance",
                                  "design_pounds",
                                  "job_total",
                                ].includes(f)
                              ? pounds(row[f])
                              : row[f]}
                  </td>
                ))}
                <td>
                  <button
                    className="text-button"
                    aria-label={
                      "Edit " +
                      (entity === "silos" ? "silo " + row.number : row.name)
                    }
                    onClick={() => {
                      setEdit({ ...row });
                      setError("");
                    }}
                  >
                    Edit
                  </button>
                  {entity !== "sand_types" && (
                    <button
                      disabled={busy}
                      className="text-button"
                      aria-label={
                        "Remove " +
                        (entity === "silos" ? "silo " + row.number : row.name)
                      }
                      onClick={() => remove(row)}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <form className="setup-form entity-form" onSubmit={save}>
          {fields.map((f) => (
            <label key={f}>
              {labels[f]}
              {f === "offline" ? (
                <input
                  type="checkbox"
                  checked={!!edit[f]}
                  onChange={(e) => set(f, e.target.checked ? 1 : 0)}
                />
              ) : f === "toe_stage" ? (
                <select
                  value={edit[f] ?? "inherit"}
                  onChange={(e) =>
                    set(
                      f,
                      e.target.value === "inherit"
                        ? null
                        : Number(e.target.value),
                    )
                  }
                >
                  <option value="inherit">Pad default</option>
                  <option value="1">Include toe before stage 1</option>
                  <option value="0">No toe</option>
                </select>
              ) : f === "side" ? (
                <select
                  value={edit[f]}
                  onChange={(e) => set(f, e.target.value)}
                >
                  <option>A</option>
                  <option>B</option>
                </select>
              ) : f === "sand_type_id" ? (
                <select
                  value={edit[f]}
                  onChange={(e) => set(f, Number(e.target.value))}
                >
                  {pad.sand_types.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  required={
                    !["manual_pin", "customer"].includes(f) &&
                    !(entity === "silos" && f === "name")
                  }
                  type={["name", "customer"].includes(f) ? "text" : "number"}
                  min={["starting_balance", "job_total"].includes(f) ? 0 : 1}
                  step={
                    [
                      "capacity",
                      "starting_balance",
                      "design_pounds",
                      "job_total",
                    ].includes(f)
                      ? "any"
                      : 1
                  }
                  value={edit[f] ?? ""}
                  onChange={(e) =>
                    set(
                      f,
                      ["name", "customer"].includes(f)
                        ? e.target.value
                        : f === "manual_pin" && e.target.value === ""
                          ? null
                          : Number(e.target.value),
                    )
                  }
                />
              )}
            </label>
          ))}
          {entity === "wells" && (
            <fieldset className="well-overrides">
              <legend>Per-stage overrides · lb (blank uses job design)</legend>
              {pad.sand_types.map((m) => (
                <label key={m.id}>
                  {m.name}
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={
                      edit.overrides?.find((d: any) => d.sand_type_id === m.id)
                        ?.pounds ?? ""
                    }
                    onChange={(e) =>
                      set("overrides", [
                        ...(edit.overrides ?? []).filter(
                          (d: any) => d.sand_type_id !== m.id,
                        ),
                        ...(e.target.value === ""
                          ? []
                          : [
                              {
                                sand_type_id: m.id,
                                pounds: Number(e.target.value),
                              },
                            ]),
                      ])
                    }
                  />
                </label>
              ))}
            </fieldset>
          )}
          <div className="form-actions">
            <button disabled={busy} className="primary">
              Save
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setEdit(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
export default function Setup({
  pad,
  onSave,
  onActivate,
}: {
  pad: Pad;
  onSave: (p: Pad, message?: string) => void;
  onActivate: (p: Pad) => void;
}) {
  const [form, setForm] = useState({
      ...pad.settings,
      name: pad.pad.name,
      customer: pad.pad.customer,
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const set = (f: string, v: any) => setForm({ ...form, [f]: v });
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onSave(await request("settings", form, "PUT"), "Job settings saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="setup">
      <h1>Setup</h1>
      <section className="setup-section">
        <h2>Pad identity</h2>
        <form className="settings-form" onSubmit={save}>
          {(
            [
              "name",
              "customer",
              "pounds_per_ton",
              "pounds_per_truckload",
              "reserve",
            ] as const
          ).map((f) => (
            <label key={f}>
              {
                {
                  name: "Pad name",
                  customer: "Customer",
                  pounds_per_ton: "Pounds per ton",
                  pounds_per_truckload: "Pounds per truckload",
                  reserve: "Reorder reserve · stages",
                }[f]
              }
              <input
                required={f !== "customer"}
                type={f === "name" || f === "customer" ? "text" : "number"}
                min={f === "reserve" ? 0 : 1}
                step="any"
                value={form[f]}
                onChange={(e) =>
                  set(
                    f,
                    f === "name" || f === "customer"
                      ? e.target.value
                      : Number(e.target.value),
                  )
                }
              />
            </label>
          ))}
          <label>
            Draw strategy
            <select
              value={form.strategy}
              onChange={(e) => set("strategy", e.target.value)}
            >
              {Object.entries({
                sequential: "Sequential rotation",
                partials: "Partials then rotate",
                least_used: "Least used first",
                emptiest: "Emptiest first",
                fullest: "Fullest first",
                pairs: "Pairs 6-2-5-1",
              }).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {(["clear_pins", "auto_advance", "toe_stage"] as const).map((f) => (
            <label className="check-label" key={f}>
              <input
                type="checkbox"
                checked={!!form[f]}
                onChange={(e) => set(f, e.target.checked ? 1 : 0)}
              />
              {
                {
                  clear_pins: "Clear manual silo pins after a completed stage",
                  auto_advance: "Auto-advance well and stage after a run",
                  toe_stage: "Include toe stage before stage 1 by default",
                }[f]
              }
            </label>
          ))}
          {!form.auto_advance && (
            <>
              <label>
                Current well
                <select
                  value={form.current_well_id ?? ""}
                  onChange={(e) =>
                    set(
                      "current_well_id",
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                >
                  <option value="">First unfinished well</option>
                  {pad.wells.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Current stage (0 = toe)
                <input
                  type="number"
                  min="0"
                  value={form.current_stage}
                  onChange={(e) => set("current_stage", Number(e.target.value))}
                />
              </label>
            </>
          )}
          <button className="primary" disabled={busy}>
            Save settings
          </button>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </form>
        <p className="muted">
          Manual pins draw first. Pairs use matching Side A/B positions in order
          6, 2, 5, 1, then 4, 3. Toe is stage 0 and adds one designed stage to
          the job plan.
        </p>
      </section>
      {(["wells", "sand_types", "silos"] as const).map((entity) => (
        <Editor
          key={entity}
          entity={entity}
          pad={pad}
          onSave={(p) => onSave(p, "Setup saved.")}
        />
      ))}
      <CustomerOrders pad={pad} onSave={onSave} />
      <Suppliers pad={pad} onSave={onSave} />
      <ProductMap pad={pad} onSave={onSave} />
      <NewPad onActivate={onActivate} />
      <DatabaseDownload padId={pad.pad.id} />
    </main>
  );
}
