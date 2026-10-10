import type { Express, Response } from "express";
import type Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { snapshot } from "./store";
import { captureDesign } from "./migrate";
export function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
export function num(v: unknown, name: string, min = 0, integer = false) {
  if (
    typeof v !== "number" ||
    !Number.isFinite(v) ||
    v < min ||
    (integer && !Number.isSafeInteger(v))
  )
    fail(
      `${name} must be ${integer ? "a whole number" : "a number"} of at least ${min}.`,
    );
  return v as number;
}
export function str(v: unknown, name: string) {
  if (typeof v !== "string" || !v.trim() || v.length > 200)
    fail(`${name} is required (maximum 200 characters).`);
  return (v as string).trim();
}
export function date(v: unknown) {
  const d = str(v, "Date");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(d) ||
    Number.isNaN(Date.parse(d)) ||
    new Date(d).toISOString().slice(0, 10) !== d
  )
    fail("Enter a valid date.");
  return d;
}
export function validBalances(db: Database.Database, id: number) {
  const p = snapshot(db, id);
  if (p.all_silos.some((s) => s.on_hand < 0 || s.on_hand > s.capacity))
    fail(
      "This change would put a silo below zero or above capacity. Correct the ledger in an order that preserves valid balances.",
    );
  return p;
}
export function rememberProduct(
  db: Database.Database,
  id: number,
  b: Record<string, unknown>,
) {
  const code = typeof b.product_code === "string" ? b.product_code.trim() : "";
  if (code && b.remember_product === true)
    db.prepare(
      "INSERT INTO mine_codes(pad_id,product_code,sand_type_id) VALUES(?,?,?) ON CONFLICT(pad_id,product_code) DO UPDATE SET sand_type_id=excluded.sand_type_id",
    ).run(id, str(code, "Product code"), b.sand_type_id);
}
export function ledgerRoutes(app: Express, db: Database.Database) {
  const compute = (res: Response) => snapshot(db, res.locals.padId);
  for (const entity of ["deliveries", "runs"] as const) {
    app.put(`/api/${entity}/:id`, (req, res) => {
      const id = res.locals.padId;
      const result = db.transaction(() => {
        const old = db
          .prepare(`SELECT * FROM ${entity} WHERE id=? AND pad_id=?`)
          .get(num(Number(req.params.id), "Record", 1, true), id) as
          Record<string, unknown> | undefined;
        if (!old) fail("Record not found.", 404);
        if (old.voided_at) fail("A voided record cannot be edited.");
        const b = req.body,
          p = compute(res),
          s = p.all_silos.find((s) => s.id === b.silo_id);
        if (!s) fail("Select a silo from this pad.");
        if (s.sand_type_id !== b.sand_type_id)
          fail("Mesh must match the silo assignment.");
        db.prepare(
          "INSERT INTO ledger_edits(pad_id,entity,record_id,action,before_json,changed_at) VALUES(?,?,?,?,?,?)",
        ).run(
          id,
          entity,
          old.id,
          "edit",
          JSON.stringify(old),
          new Date().toISOString(),
        );
        if (entity === "deliveries") {
          const t = str(b.ticket_number, "Ticket number");
          if (
            db
              .prepare(
                "SELECT id FROM deliveries WHERE pad_id=? AND ticket_number=? COLLATE NOCASE AND id<>? AND voided_at IS NULL",
              )
              .get(id, t, old.id) &&
            b.confirm_duplicate !== true
          )
            fail(
              "This ticket number already exists. Confirm the duplicate before saving.",
              409,
            );
          db.prepare(
            "UPDATE deliveries SET date=?,ticket_number=?,supplier=?,product_code=?,sand_type_id=?,pounds=?,silo_id=? WHERE id=? AND pad_id=?",
          ).run(
            date(b.date),
            t,
            str(b.supplier, "Supplier"),
            typeof b.product_code === "string" ? b.product_code.trim() : "",
            b.sand_type_id,
            num(b.pounds, "Pounds", 1),
            s.id,
            old.id,
            id,
          );
          rememberProduct(db, id, b);
        } else {
          const well = p.all_wells.find((w) => w.id === b.well_id);
          if (!well) fail("Select a well from this pad.");
          const stage = num(b.stage, "Stage", 0, true);
          if (stage === 0 && !(well.toe_stage ?? p.settings.toe_stage))
            fail("This well has no toe stage.");
          if (stage > well.planned_stages)
            fail("Stage exceeds this well’s planned count.");
          captureDesign(db, id, well.id, stage);
          db.prepare(
            "UPDATE runs SET date=?,well_id=?,stage=?,sand_type_id=?,pounds=?,silo_id=? WHERE id=? AND pad_id=?",
          ).run(
            date(b.date),
            well.id,
            stage,
            b.sand_type_id,
            num(b.pounds, "Pounds", 1),
            s.id,
            old.id,
            id,
          );
        }
        return validBalances(db, id);
      })();
      res.json(result);
    });
    app.post(`/api/${entity}/:id/void`, (req, res) => {
      const id = res.locals.padId;
      const result = db.transaction(() => {
        const old = db
          .prepare(`SELECT * FROM ${entity} WHERE id=? AND pad_id=?`)
          .get(num(Number(req.params.id), "Record", 1, true), id) as
          Record<string, unknown> | undefined;
        if (!old) fail("Record not found.", 404);
        if (old.voided_at) fail("Record is already voided.");
        const now = new Date().toISOString();
        db.prepare(
          "INSERT INTO ledger_edits(pad_id,entity,record_id,action,before_json,changed_at) VALUES(?,?,?,?,?,?)",
        ).run(id, entity, old.id, "void", JSON.stringify(old), now);
        db.prepare(
          `UPDATE ${entity} SET voided_at=? WHERE id=? AND pad_id=?`,
        ).run(now, old.id, id);
        return validBalances(db, id);
      })();
      res.json(result);
    });
  }
  app.post("/api/pads", (req, res) => {
    const source = res.locals.padId;
    const id = db.transaction(() => {
      const id = Number(
        db
          .prepare("INSERT INTO pads(name) VALUES(?)")
          .run(str(req.body.name, "Pad name")).lastInsertRowid,
      );
      db.prepare(
        "INSERT INTO settings(id,reserve,strategy) VALUES(?,5,'sequential')",
      ).run(id);
      if (req.body.copy_setup === true) {
        const p = snapshot(db, source),
          meshes = new Map<number, number>();
        if (p.silos.length > 6)
          fail(
            "The source pad has more than 6 active silos. Remove excess silos before copying setup.",
          );
        for (const m of p.sand_types)
          meshes.set(
            m.id,
            Number(
              db
                .prepare(
                  "INSERT INTO sand_types(pad_id,name,design_pounds,job_total) VALUES(?,?,?,?)",
                )
                .run(id, m.name, m.design_pounds, m.job_total).lastInsertRowid,
            ),
          );
        for (const s of p.silos)
          db.prepare(
            "INSERT INTO silos(pad_id,number,side,sand_type_id,capacity,starting_balance,manual_pin,offline,name) VALUES(?,?,?,?,?,0,?,?,?)",
          ).run(
            id,
            s.number,
            s.side,
            meshes.get(s.sand_type_id),
            s.capacity,
            s.manual_pin,
            s.offline,
            s.name,
          );
        for (const w of p.wells) {
          const wellId = Number(
            db
              .prepare(
                "INSERT INTO wells(pad_id,name,customer,planned_stages,toe_stage) VALUES(?,?,?,?,?)",
              )
              .run(id, w.name, w.customer, w.planned_stages, w.toe_stage)
              .lastInsertRowid,
          );
          for (const d of w.overrides)
            db.prepare("INSERT INTO well_designs VALUES(?,?,?)").run(
              wellId,
              meshes.get(d.sand_type_id),
              d.pounds,
            );
        }
        db.prepare("UPDATE pads SET customer=? WHERE id=?").run(
          p.pad.customer,
          id,
        );
        db.prepare(
          "UPDATE settings SET reserve=?,strategy=?,pounds_per_ton=?,pounds_per_truckload=?,clear_pins=?,auto_advance=?,toe_stage=? WHERE id=?",
        ).run(
          p.settings.reserve,
          p.settings.strategy,
          p.settings.pounds_per_ton,
          p.settings.pounds_per_truckload,
          p.settings.clear_pins,
          p.settings.auto_advance,
          p.settings.toe_stage,
          id,
        );
        for (const s of p.suppliers)
          db.prepare("INSERT INTO suppliers(pad_id,name) VALUES(?,?)").run(
            id,
            s.name,
          );
        for (const m of p.product_map)
          db.prepare(
            "INSERT INTO mine_codes(pad_id,product_code,sand_type_id) VALUES(?,?,?)",
          ).run(id, m.product_code, meshes.get(m.sand_type_id));
        for (const o of p.customer_orders)
          db.prepare(
            "INSERT INTO customer_orders(pad_id,customer,strategy,silo_order) VALUES(?,?,?,?)",
          ).run(id, o.customer, o.strategy, JSON.stringify(o.silo_order));
      }
      return id;
    })();
    res.status(201).json(snapshot(db, id));
  });
  app.post("/api/product-map", (req, res) => {
    const b = req.body;
    if (!compute(res).sand_types.some((m) => m.id === b.sand_type_id))
      fail("Select a mesh from this pad.");
    rememberProduct(db, res.locals.padId, {
      ...b,
      product_code: str(b.product_code, "Product code"),
      remember_product: true,
    });
    res.json(compute(res));
  });
  app.delete("/api/product-map/:id", (req, res) => {
    if (
      !db
        .prepare("DELETE FROM mine_codes WHERE id=? AND pad_id=?")
        .run(num(Number(req.params.id), "Mapping", 1, true), res.locals.padId)
        .changes
    )
      fail("Mapping not found.", 404);
    res.json(compute(res));
  });
  app.get("/api/database", async (_req, res, next) => {
    const dir = mkdtempSync(join(tmpdir(), "sand-pad-backup-")),
      file = join(dir, "sand-pad.sqlite");
    try {
      await db.backup(file);
      res.download(file, "sand-pad.sqlite", (err) => {
        rmSync(dir, { recursive: true, force: true });
        if (err && !res.headersSent) next(err);
      });
    } catch (err) {
      rmSync(dir, { recursive: true, force: true });
      next(err);
    }
  });
}
