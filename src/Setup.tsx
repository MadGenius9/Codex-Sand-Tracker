import { useState, type FormEvent } from "react";
import type { Pad } from "./types";
import { request } from "./api";
import { pounds } from "./Yard";
type Row = Record<string, string | number | null>;
function Editor({
  entity,
  pad,
  onSave,
}: {
  entity: "wells" | "sand_types" | "silos";
  pad: Pad;
  onSave: (p: Pad) => void;
}) {
  const defaults: Row =
    entity === "wells"
      ? { name: "", customer: "", planned_stages: 40 }
      : entity === "sand_types"
        ? { name: "", design_pounds: 80000 }
        : {
            number: Math.max(0, ...pad.silos.map((s) => s.number)) + 1,
            side: "A",
            sand_type_id: pad.sand_types[0]?.id ?? 0,
            capacity: 250000,
            starting_balance: 0,
            manual_pin: null,
            offline: 0,
          };
  const [edit, setEdit] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const title = { wells: "Wells", sand_types: "Sand types", silos: "Silos" }[
    entity
  ];
  const rows = pad[entity] as unknown as Row[];
  const fields =
    entity === "wells"
      ? ["name", "customer", "planned_stages"]
      : entity === "sand_types"
        ? ["name", "design_pounds"]
        : [
            "number",
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
    design_pounds: "Design lb / stage",
    number: "Number",
    side: "Side",
    sand_type_id: "Mesh",
    capacity: "Capacity · lb",
    starting_balance: "Starting balance · lb",
    manual_pin: "Manual order pin",
    offline: "Offline",
  };
  const set = (key: string, value: string | number | null) =>
    setEdit({ ...edit!, [key]: value });
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onSave(await request(`setup/${entity}`, edit));
      setEdit(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="setup-section">
      <div className="rail-heading">
        <h2>{title}</h2>
        <button
          className="text-button"
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
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {fields.map((f) => (
                <th key={f}>{labels[f]}</th>
              ))}
              <th>
                <span className="sr-only">Edit</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {fields.map((f) => (
                  <td key={f}>
                    {f === "sand_type_id"
                      ? pad.sand_types.find((m) => m.id === row[f])?.name
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
                              ].includes(f)
                            ? pounds(Number(row[f]))
                            : row[f]}
                  </td>
                ))}
                <td>
                  <button
                    className="text-button"
                    onClick={() => {
                      setEdit({ ...row });
                      setError("");
                    }}
                    aria-label={`Edit ${entity === "silos" ? "silo " + row.number : row.name}`}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <form className="setup-form" onSubmit={save}>
          {fields.map((f) => (
            <label key={f}>
              {labels[f]}
              {f === "offline" ? (
                <input
                  type="checkbox"
                  checked={!!edit[f]}
                  onChange={(e) => set(f, e.target.checked ? 1 : 0)}
                />
              ) : f === "side" ? (
                <select
                  value={String(edit[f])}
                  onChange={(e) => set(f, e.target.value)}
                >
                  <option>A</option>
                  <option>B</option>
                </select>
              ) : f === "sand_type_id" ? (
                <select
                  value={Number(edit[f])}
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
                  required={f !== "manual_pin"}
                  type={["name", "customer"].includes(f) ? "text" : "number"}
                  min={f === "starting_balance" ? 0 : 1}
                  step={
                    ["capacity", "starting_balance", "design_pounds"].includes(
                      f,
                    )
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
          <div className="form-actions">
            <button className="primary" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setEdit(null)}
            >
              Cancel
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
export default function Setup({
  pad,
  onSave,
}: {
  pad: Pad;
  onSave: (p: Pad, message?: string) => void;
}) {
  const [reserve, setReserve] = useState(pad.settings.reserve);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      onSave(
        await request("settings", { reserve, strategy: "sequential" }, "PUT"),
        "Reserve updated.",
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="setup">
      <h1>Setup</h1>
      <form className="settings-form" onSubmit={save}>
        <label>
          Reorder reserve · stages
          <input
            type="number"
            min="0"
            step=".1"
            value={reserve}
            onChange={(e) => setReserve(Number(e.target.value))}
            required
          />
        </label>
        <label>
          Draw strategy
          <select value="sequential" onChange={() => {}}>
            <option value="sequential">
              Sequential rotation · manual pins first
            </option>
          </select>
        </label>
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
        Rotation starts after the last silo used for each mesh. Lower manual
        pins draw first. Matching pins are flagged in the silo rail. Reorder
        reserve uses online inventory.
      </p>
      {(["wells", "sand_types", "silos"] as const).map((entity) => (
        <Editor
          key={entity}
          entity={entity}
          pad={pad}
          onSave={(p) => onSave(p, "Setup saved.")}
        />
      ))}
    </main>
  );
}
