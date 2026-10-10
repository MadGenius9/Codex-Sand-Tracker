import type Database from "better-sqlite3";
import type { Express } from "express";
import { snapshot } from "./store";
import { fail, num, str } from "./ledger";
export function migrateCustomerOrders(db: Database.Database) {
  if (Number(db.pragma("user_version", { simple: true })) >= 5) return;
  db.transaction(() => {
    db.exec(
      `CREATE TABLE customer_orders(id INTEGER PRIMARY KEY,pad_id INTEGER NOT NULL REFERENCES pads(id),customer TEXT NOT NULL COLLATE NOCASE,strategy TEXT NOT NULL CHECK(strategy IN ('sequential','partials','least_used','emptiest','fullest','pairs','custom')),silo_order TEXT NOT NULL DEFAULT '[]',UNIQUE(pad_id,customer)); PRAGMA user_version=5;`,
    );
  })();
}
export function customerOrderRoutes(app: Express, db: Database.Database) {
  app.post("/api/pull-plan", (req, res) => {
    const id = res.locals.padId,
      p = snapshot(db, id),
      well = p.wells.find((w) => w.id === req.body.well_id);
    if (!well) fail("Select a well from this pad.");
    const stage = num(req.body.stage, "Stage", 0, true);
    if (
      stage > well.planned_stages ||
      (stage === 0 && !(well.toe_stage ?? p.settings.toe_stage))
    )
      fail("Stage is outside the selected well’s plan.");
    res.json(snapshot(db, id, { wellId: well.id, stage }));
  });
  app.post("/api/customer-orders", (req, res) => {
    const padId = res.locals.padId,
      b = req.body,
      p = snapshot(db, padId),
      customer = str(b.customer, "Customer");
    if (
      ![
        "sequential",
        "partials",
        "least_used",
        "emptiest",
        "fullest",
        "pairs",
        "custom",
      ].includes(b.strategy)
    )
      fail("Select a valid customer draw strategy.");
    const order = b.strategy === "custom" ? b.silo_order : [];
    if (
      !Array.isArray(order) ||
      order.length > 6 ||
      (b.strategy === "custom" && !order.length)
    )
      fail("Enter between 1 and 6 silo numbers for the custom order.");
    const seen = new Set<number>();
    for (const value of order) {
      const n = num(value, "Silo number", 1, true);
      if (seen.has(n)) fail("A silo may appear only once in a customer order.");
      if (!p.silos.some((s) => s.number === n))
        fail("Every silo number must belong to this pad’s active yard.");
      seen.add(n);
    }
    db.prepare(
      "INSERT INTO customer_orders(pad_id,customer,strategy,silo_order) VALUES(?,?,?,?) ON CONFLICT(pad_id,customer) DO UPDATE SET strategy=excluded.strategy,silo_order=excluded.silo_order",
    ).run(padId, customer, b.strategy, JSON.stringify(order));
    res.json(snapshot(db, padId));
  });
  app.delete("/api/customer-orders/:id", (req, res) => {
    if (
      !db
        .prepare("DELETE FROM customer_orders WHERE id=? AND pad_id=?")
        .run(
          num(Number(req.params.id), "Customer order", 1, true),
          res.locals.padId,
        ).changes
    )
      fail("Customer order not found.", 404);
    res.json(snapshot(db, res.locals.padId));
  });
}
