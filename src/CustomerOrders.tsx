import { useState, type FormEvent } from "react";
import type { Pad } from "./types";
import { request } from "./api";
export const strategies = {
  sequential: "Sequential rotation",
  partials: "Partials then rotate",
  least_used: "Least used first",
  emptiest: "Emptiest first",
  fullest: "Fullest first",
  pairs: "Pairs 6-2-5-1",
  custom: "Custom silo order",
};
export function DrawOrderNote({ pad }: { pad: Pad }) {
  return (
    <p className="muted">
      Pull order ·{" "}
      {pad.draw_order.source === "customer"
        ? pad.draw_order.customer + " customer order"
        : "Pad default"}{" "}
      · {strategies[pad.draw_order.strategy]}
      {pad.draw_order.silo_order.length
        ? " · " + pad.draw_order.silo_order.join(" → ")
        : ""}
      . Manual pins take priority.
    </p>
  );
}
export default function CustomerOrders({
  pad,
  onSave,
}: {
  pad: Pad;
  onSave: (p: Pad, message?: string) => void;
}) {
  const [customer, setCustomer] = useState(""),
    [strategy, setStrategy] = useState<keyof typeof strategies>("custom"),
    [sequence, setSequence] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onSave(
        await request("customer-orders", {
          customer,
          strategy,
          silo_order: sequence.trim()
            ? sequence
                .trim()
                .split(/[\s,]+/)
                .map(Number)
            : [],
        }),
        "Customer pull order saved.",
      );
      setCustomer("");
      setSequence("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: number) {
    setBusy(true);
    setError("");
    try {
      onSave(
        await request("customer-orders/" + id, {}, "DELETE"),
        "Customer order removed. Pad default applies.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const customers = [
    ...new Set(
      [pad.pad.customer, ...pad.wells.map((w) => w.customer)].filter(Boolean),
    ),
  ];
  return (
    <section className="setup-section">
      <h2>Customer pull orders</h2>
      <p className="muted">
        The next well’s customer selects its saved order; a blank well customer
        uses the pad customer. Customers without a saved order use the pad draw
        strategy. Each mesh uses only its online tanks. Unlisted tanks follow
        sequential rotation; offline and removed tanks are skipped.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Strategy</th>
              <th>Silo sequence</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pad.customer_orders.map((o) => (
              <tr key={o.id}>
                <td>{o.customer}</td>
                <td>{strategies[o.strategy]}</td>
                <td>{o.silo_order.join(" → ") || "Automatic"}</td>
                <td>
                  <button
                    className="text-button"
                    onClick={() => {
                      setCustomer(o.customer);
                      setStrategy(o.strategy);
                      setSequence(o.silo_order.join(", "));
                      setError("");
                    }}
                  >
                    Edit order
                  </button>
                  <button
                    disabled={busy}
                    className="text-button"
                    onClick={() => remove(o.id)}
                  >
                    Remove order
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="setup-form pad-tools-form" onSubmit={save}>
        <label>
          Order customer
          <input
            required
            maxLength={200}
            list="order-customers"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
          />
          <datalist id="order-customers">
            {customers.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label>
          Customer draw strategy
          <select
            aria-label="Customer draw strategy"
            value={strategy}
            onChange={(e) =>
              setStrategy(e.target.value as keyof typeof strategies)
            }
          >
            {Object.entries(strategies).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {strategy === "custom" && (
          <label>
            Silo order
            <input
              required
              value={sequence}
              aria-label="Silo order"
              placeholder={pad.silos.map((s) => s.number).join(", ")}
              onChange={(e) => setSequence(e.target.value)}
            />
            <small>Use silo numbers, separated by commas. Maximum six.</small>
          </label>
        )}
        <button disabled={busy} className="primary">
          Save customer order
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
