import { useState, type FormEvent } from "react";
import type { Pad } from "./types";
import { request } from "./api";
export function NewPad({ onActivate }: { onActivate: (p: Pad) => void }) {
  const [name, setName] = useState(""),
    [copy, setCopy] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const p = await request("pads", { name, copy_setup: copy });
      onActivate(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="setup-section">
      <h2>Create pad</h2>
      <p className="muted">
        The current pad and its ledger are preserved. New pads start with zero
        inventory and no tickets or runs.
      </p>
      <form className="setup-form pad-tools-form" onSubmit={create}>
        <label>
          Pad name
          <input
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={copy}
            onChange={(e) => setCopy(e.target.checked)}
          />{" "}
          Copy wells, meshes and silo setup from this pad
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "Creating…" : "Create pad"}
        </button>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
export function ProductMap({
  pad,
  onSave,
}: {
  pad: Pad;
  onSave: (p: Pad, message?: string) => void;
}) {
  const [code, setCode] = useState(""),
    [mesh, setMesh] = useState(pad.sand_types[0]?.id ?? 0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onSave(
        await request("product-map", {
          product_code: code,
          sand_type_id: mesh,
        }),
        "Mine code mapping saved.",
      );
      setCode("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: number) {
    try {
      onSave(
        await request("product-map/" + id, {}, "DELETE"),
        "Mapping removed.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="setup-section">
      <h2>Product codes</h2>
      <p className="muted">
        A mine code fills the ticket mesh, regardless of supplier. Matching
        ignores letter case.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Mine code</th>
              <th>Mesh</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pad.product_map.map((m) => (
              <tr key={m.id}>
                <td>{m.product_code}</td>
                <td>
                  {pad.sand_types.find((s) => s.id === m.sand_type_id)?.name}
                </td>
                <td>
                  <button
                    className="text-button"
                    onClick={() => {
                      setCode(m.product_code);
                      setMesh(m.sand_type_id);
                    }}
                  >
                    Edit mapping
                  </button>
                  <button className="text-button" onClick={() => remove(m.id)}>
                    Remove mapping
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="setup-form pad-tools-form" onSubmit={save}>
        <label>
          Mapped product code
          <input
            required
            maxLength={200}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <label>
          Mapped mesh
          <select
            aria-label="Mapped mesh"
            value={mesh}
            onChange={(e) => setMesh(Number(e.target.value))}
          >
            {pad.sand_types.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" disabled={busy || !mesh}>
          Save mapping
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
export function Suppliers({
  pad,
  onSave,
}: {
  pad: Pad;
  onSave: (p: Pad, message?: string) => void;
}) {
  const [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onSave(await request("suppliers", { name }), "Supplier saved.");
      setName("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: number) {
    try {
      onSave(
        await request("suppliers/" + id, {}, "DELETE"),
        "Supplier removed from saved list.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="setup-section">
      <h2>Suppliers</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {pad.suppliers.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>
                  <button className="text-button" onClick={() => remove(s.id)}>
                    Remove supplier
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="setup-form pad-tools-form" onSubmit={save}>
        <label>
          Supplier name
          <input
            required
            value={name}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button className="primary" disabled={busy}>
          Add supplier
        </button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
export function DatabaseDownload({ padId }: { padId: number }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function download() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/database?pad_id=${padId}`);
      if (!res.ok) {
        const data = await res.json();
        throw Error(data.error ?? "Database download failed.");
      }
      const blob = await res.blob(),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "sand-pad.sqlite";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="setup-section">
      <h2>Database</h2>
      <p className="muted">
        Download a consistent SQLite backup containing every pad, its ledger,
        voids, edit audit and product mappings.
      </p>
      <button className="primary" disabled={busy} onClick={download}>
        {busy ? "Preparing backup…" : "Download SQLite"}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
