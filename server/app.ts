import express from "express";
import type Database from "better-sqlite3";
import { snapshot } from "./store";
const fail = (message: string, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
function num(value: unknown, name: string, min = 0, integer = false) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    (integer && !Number.isInteger(value))
  )
    fail(
      `${name} must be ${integer ? "a whole number" : "a number"} of at least ${min}.`,
    );
  return value as number;
}
function str(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 200)
    fail(`${name} is required (maximum 200 characters).`);
  return (value as string).trim();
}
export function createApp(db: Database.Database) {
  const app = express();
  app.use(express.json({ limit: "64kb" }));
  app.get("/api/pad", (_req, res) => res.json(snapshot(db)));
  app.post("/api/deliveries", (req, res) => {
    const b = req.body;
    const ticket = str(b.ticket_number, "Ticket number");
    const result = db.transaction(() => {
      const pad = snapshot(db);
      const silo = pad.silos.find(
        (s) => s.id === num(b.silo_id, "Silo", 1, true),
      );
      if (!silo) fail("Silo not found.");
      if (silo!.sand_type_id !== b.sand_type_id)
        fail("Ticket mesh must match the silo assignment.");
      const pounds = num(b.pounds, "Pounds", 1);
      if (silo!.on_hand + pounds > silo!.capacity)
        fail("Delivery would exceed silo capacity.");
      const duplicate = db
        .prepare(
          "SELECT id FROM deliveries WHERE ticket_number=? COLLATE NOCASE",
        )
        .get(ticket);
      if (duplicate && !b.confirm_duplicate)
        fail(
          "This ticket number already exists. Confirm the duplicate before saving.",
          409,
        );
      const date = str(b.date, "Date");
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        Number.isNaN(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date
      )
        fail("Enter a valid delivery date.");
      db.prepare(
        "INSERT INTO deliveries(date,ticket_number,supplier,product_code,sand_type_id,pounds,silo_id) VALUES(?,?,?,?,?,?,?)",
      ).run(
        date,
        ticket,
        str(b.supplier, "Supplier"),
        typeof b.product_code === "string" ? b.product_code.trim() : "",
        b.sand_type_id,
        pounds,
        silo!.id,
      );
      return snapshot(db);
    })();
    res.status(201).json(result);
  });
  app.post("/api/runs", (req, res) => {
    const result = db.transaction(() => {
      const b = req.body;
      const pad = snapshot(db);
      const well = pad.wells.find((w) => w.id === b.well_id);
      if (!well) fail("Select a well.");
      const stage = num(b.stage, "Stage", 1, true);
      if (stage > well!.planned_stages)
        fail("Stage exceeds this well’s planned count.");
      const entries = Array.isArray(b.entries) ? b.entries : [];
      if (!entries.length || entries.length > pad.silos.length)
        fail("Select at least one silo.");
      const ids = new Set<number>();
      const changes = [];
      for (const entry of entries) {
        const silo = pad.silos.find((s) => s.id === entry.silo_id);
        if (!silo) fail("Silo not found.");
        if (ids.has(silo!.id)) fail("A silo may appear only once in a run.");
        ids.add(silo!.id);
        if (silo!.offline) fail(`Silo ${silo!.number} is offline.`);
        if (silo!.sand_type_id !== b.sand_type_id)
          fail("All selected silos must match the run mesh.");
        const pounds = num(entry.pounds, "Pounds", 1);
        if (pounds > silo!.on_hand)
          fail(`Silo ${silo!.number} does not have enough sand.`);
        db.prepare(
          "INSERT INTO runs(well_id,stage,sand_type_id,pounds,silo_id) VALUES(?,?,?,?,?)",
        ).run(well!.id, stage, b.sand_type_id, pounds, silo!.id);
        changes.push({
          silo_id: silo!.id,
          before: silo!.on_hand,
          after: silo!.on_hand - pounds,
        });
      }
      return { pad: snapshot(db), changes };
    })();
    res.status(201).json(result);
  });
  app.put("/api/settings", (req, res) => {
    const reserve = num(req.body.reserve, "Stage reserve");
    if (req.body.strategy !== "sequential")
      fail("Only sequential rotation is supported.");
    db.prepare("UPDATE settings SET reserve=?,strategy=? WHERE id=1").run(
      reserve,
      "sequential",
    );
    res.json(snapshot(db));
  });
  app.post("/api/setup/:entity", (req, res) => {
    const result = db.transaction(() => {
      const b = req.body;
      const entity = req.params.entity;
      const id = b.id === undefined ? null : num(b.id, "ID", 1, true);
      if (!["wells", "sand_types", "silos"].includes(entity))
        fail("Unknown setup entity.", 404);
      if (id && !db.prepare(`SELECT id FROM ${entity} WHERE id=?`).get(id))
        fail("Record not found.", 404);
      let values: unknown[];
      let fields: string[];
      if (entity === "wells") {
        fields = ["name", "customer", "planned_stages"];
        values = [
          str(b.name, "Well name"),
          str(b.customer, "Customer"),
          num(b.planned_stages, "Planned stages", 1, true),
        ];
        if (id) {
          const max =
            (
              db
                .prepare("SELECT MAX(stage) AS stage FROM runs WHERE well_id=?")
                .get(id) as { stage: number }
            ).stage ?? 0;
          if (Number(values[2]) < max)
            fail("Planned count cannot exclude recorded stages.");
        }
      } else if (entity === "sand_types") {
        fields = ["name", "design_pounds"];
        values = [
          str(b.name, "Sand name"),
          num(b.design_pounds, "Design pounds", 1),
        ];
      } else {
        const pad = snapshot(db);
        const old = pad.silos.find((s) => s.id === id);
        const mesh = num(b.sand_type_id, "Mesh", 1, true);
        if (!pad.sand_types.some((s) => s.id === mesh))
          fail("Select a valid mesh.");
        if (b.side !== "A" && b.side !== "B") fail("Side must be A or B.");
        const capacity = num(b.capacity, "Capacity", 1);
        const start = num(b.starting_balance, "Starting balance");
        if (
          old &&
          old.sand_type_id !== mesh &&
          (pad.deliveries.some((d) => d.silo_id === id) ||
            pad.runs.some((r) => r.silo_id === id))
        )
          fail(
            "A silo with history cannot change mesh. Add a new silo for a different mesh.",
          );
        const balance = old
          ? old.on_hand - old.starting_balance + start
          : start;
        if (balance < 0 || balance > capacity)
          fail(
            "Starting balance and capacity must contain the computed on-hand.",
          );
        fields = [
          "number",
          "side",
          "sand_type_id",
          "capacity",
          "starting_balance",
          "manual_pin",
          "offline",
        ];
        values = [
          num(b.number, "Silo number", 1, true),
          b.side,
          mesh,
          capacity,
          start,
          b.manual_pin === null || b.manual_pin === ""
            ? null
            : num(b.manual_pin, "Manual pin", 1, true),
          b.offline ? 1 : 0,
        ];
      }
      if (id)
        db.prepare(
          `UPDATE ${entity} SET ${fields.map((f) => `${f}=?`).join(",")} WHERE id=?`,
        ).run(...values, id);
      else
        db.prepare(
          `INSERT INTO ${entity}(${fields.join(",")}) VALUES(${fields.map(() => "?").join(",")})`,
        ).run(...values);
      return snapshot(db);
    })();
    res.json(result);
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "API route not found." }),
  );
  app.use(
    (
      err: Error & { status?: number; code?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res
        .status(
          err.status ?? (err.code?.startsWith("SQLITE_CONSTRAINT") ? 400 : 500),
        )
        .json({
          error: err.code?.startsWith("SQLITE_CONSTRAINT")
            ? "A record conflicts with an existing number or name."
            : err.message,
        });
    },
  );
  return app;
}
