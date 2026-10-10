import express from "express";
import type Database from "better-sqlite3";
import { snapshot } from "./store";
import { captureDesign } from "./migrate";
import { jobRoutes, afterRun } from "./job";
import {
  ledgerRoutes,
  rememberProduct,
  validBalances,
  date as validDate,
} from "./ledger";
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
  app.use("/api", (req, res, next) => {
    try {
      const id = req.query.pad_id === undefined ? 1 : Number(req.query.pad_id);
      num(id, "Pad", 1, true);
      if (!db.prepare("SELECT id FROM pads WHERE id=?").get(id))
        fail("Pad not found.", 404);
      res.locals.padId = id;
      next();
    } catch (err) {
      next(err);
    }
  });
  app.get("/api/pad", (_req, res) => res.json(snapshot(db, res.locals.padId)));
  app.post("/api/deliveries", (req, res) => {
    const b = req.body;
    const ticket = str(b.ticket_number, "Ticket number");
    const result = db.transaction(() => {
      const pad = snapshot(db, res.locals.padId);
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
          "SELECT id FROM deliveries WHERE pad_id=? AND ticket_number=? COLLATE NOCASE AND voided_at IS NULL",
        )
        .get(res.locals.padId, ticket);
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
        "INSERT INTO deliveries(pad_id,date,ticket_number,supplier,product_code,sand_type_id,pounds,silo_id) VALUES(?,?,?,?,?,?,?,?)",
      ).run(
        res.locals.padId,
        date,
        ticket,
        str(b.supplier, "Supplier"),
        typeof b.product_code === "string" ? b.product_code.trim() : "",
        b.sand_type_id,
        pounds,
        silo!.id,
      );
      db.prepare(
        "INSERT INTO suppliers(pad_id,name) VALUES(?,?) ON CONFLICT(pad_id,name) DO NOTHING",
      ).run(res.locals.padId, str(b.supplier, "Supplier"));
      rememberProduct(db, res.locals.padId, b);
      return snapshot(db, res.locals.padId);
    })();
    res.status(201).json(result);
  });
  app.post("/api/runs", (req, res) => {
    const result = db.transaction(() => {
      const b = req.body;
      const pad = snapshot(db, res.locals.padId);
      const well = pad.wells.find((w) => w.id === b.well_id);
      if (!well) fail("Select a well.");
      const stage = num(b.stage, "Stage", 0, true);
      if (stage === 0 && !(well!.toe_stage ?? pad.settings.toe_stage))
        fail("This well has no toe stage.");
      if (stage > well!.planned_stages)
        fail("Stage exceeds this well’s planned count.");
      const entries = Array.isArray(b.entries) ? b.entries : [];
      if (!entries.length || entries.length > pad.silos.length)
        fail("Select at least one silo.");
      const ids = new Set<number>();
      const changes = [];
      captureDesign(db, res.locals.padId, well!.id, stage);
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
          "INSERT INTO runs(pad_id,date,well_id,stage,sand_type_id,pounds,silo_id) VALUES(?,?,?,?,?,?,?)",
        ).run(
          res.locals.padId,
          validDate(b.date ?? new Date().toLocaleDateString("en-CA")),
          well!.id,
          stage,
          b.sand_type_id,
          pounds,
          silo!.id,
        );
        changes.push({
          silo_id: silo!.id,
          before: silo!.on_hand,
          after: silo!.on_hand - pounds,
        });
      }
      afterRun(db, res.locals.padId, well!.id, stage);
      return { pad: snapshot(db, res.locals.padId), changes };
    })();
    res.status(201).json(result);
  });
  jobRoutes(app, db);
  ledgerRoutes(app, db);
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
