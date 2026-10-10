import type { Express } from "express";
import type Database from "better-sqlite3";
import { snapshot } from "./store";
import { num, str, fail, validBalances } from "./ledger";
const flag = (v: unknown) => {
  if (v !== 0 && v !== 1 && v !== false && v !== true)
    fail("Options must be checked or unchecked.");
  return v ? 1 : 0;
};
const text = (v: unknown) =>
  typeof v === "string" && v.length <= 200
    ? v.trim()
    : fail("Text must be at most 200 characters.");
export function jobRoutes(app: Express, db: Database.Database) {
  app.put("/api/settings", (req, res) => {
    const id = res.locals.padId;
    const p = db.transaction(() => {
      const old = snapshot(db, id),
        b = req.body,
        s = { ...old.settings, ...b };
      if (
        ![
          "sequential",
          "partials",
          "least_used",
          "emptiest",
          "fullest",
          "pairs",
        ].includes(s.strategy)
      )
        fail("Select a valid draw strategy.");
      const toe = flag(s.toe_stage),
        auto = flag(s.auto_advance),
        clear = flag(s.clear_pins);
      const well =
        s.current_well_id === null
          ? null
          : old.wells.find((w) => w.id === s.current_well_id);
      if (s.current_well_id !== null && !well)
        fail("Select a current well from this pad.");
      const stage = num(s.current_stage, "Current stage", 0, true);
      if (
        well &&
        (stage > well.planned_stages ||
          (stage === 0 && !(well.toe_stage ?? toe)))
      )
        fail("Current stage is outside the selected well’s plan.");
      db.prepare("UPDATE pads SET name=?,customer=? WHERE id=?").run(
        b.name === undefined ? old.pad.name : str(b.name, "Pad name"),
        b.customer === undefined ? old.pad.customer : text(b.customer),
        id,
      );
      db.prepare(
        "UPDATE settings SET reserve=?,strategy=?,pounds_per_ton=?,pounds_per_truckload=?,clear_pins=?,auto_advance=?,toe_stage=?,current_well_id=?,current_stage=? WHERE id=?",
      ).run(
        num(s.reserve, "Reorder threshold"),
        s.strategy,
        num(s.pounds_per_ton, "Pounds per ton", 1),
        num(s.pounds_per_truckload, "Pounds per truckload", 1),
        clear,
        auto,
        toe,
        well?.id ?? null,
        stage,
        id,
      );
      return snapshot(db, id);
    })();
    res.json(p);
  });
  app.post("/api/setup/:entity", (req, res) => {
    const padId = res.locals.padId;
    const p = db.transaction(() => {
      const b = req.body,
        entity = req.params.entity;
      if (!["wells", "sand_types", "silos"].includes(entity))
        fail("Unknown setup entity.", 404);
      const id = b.id === undefined ? null : num(b.id, "ID", 1, true);
      const old = snapshot(db, padId);
      if (entity === "silos" && id === null && old.silos.length >= 6)
        fail(
          "A pad can have at most 6 active silos. Remove a silo before adding another.",
        );
      const stored = id
        ? (db
            .prepare(`SELECT * FROM ${entity} WHERE id=? AND pad_id=?`)
            .get(id, padId) as Record<string, unknown> | undefined)
        : undefined;
      if (id && (!stored || stored.deleted_at)) fail("Record not found.", 404);
      let fields: string[], values: unknown[];
      if (entity === "wells") {
        const toe =
          b.toe_stage === undefined
            ? (stored?.toe_stage ?? null)
            : b.toe_stage === null
              ? null
              : flag(b.toe_stage);
        const count = num(b.planned_stages, "Planned stages", 1, true);
        if (id) {
          const max =
            (
              db
                .prepare("SELECT MAX(stage) AS stage FROM runs WHERE well_id=?")
                .get(id) as { stage: number }
            ).stage ?? 0;
          if (count < max)
            fail("Planned count cannot exclude recorded stages.");
        }
        fields = ["name", "customer", "planned_stages", "toe_stage"];
        values = [
          str(b.name, "Well name"),
          text(b.customer ?? old.pad.customer),
          count,
          toe,
        ];
      } else if (entity === "sand_types") {
        fields = ["name", "design_pounds", "job_total"];
        values = [
          str(b.name, "Sand name"),
          num(b.design_pounds, "Design pounds", 1),
          num(b.job_total ?? stored?.job_total ?? 0, "Whole-job pounds"),
        ];
      } else {
        const mesh = num(b.sand_type_id, "Mesh", 1, true);
        if (!old.sand_types.some((m) => m.id === mesh))
          fail("Select a mesh from this pad.");
        if (b.side !== "A" && b.side !== "B") fail("Side must be A or B.");
        if (
          stored &&
          stored.sand_type_id !== mesh &&
          (old.ledger.deliveries.some((d) => d.silo_id === id) ||
            old.ledger.runs.some((r) => r.silo_id === id))
        )
          fail("A silo with history cannot change mesh. Add a new silo.");
        fields = [
          "number",
          "name",
          "side",
          "sand_type_id",
          "capacity",
          "starting_balance",
          "manual_pin",
          "offline",
        ];
        values = [
          num(b.number, "Silo number", 1, true),
          text(b.name ?? ""),
          b.side,
          mesh,
          num(b.capacity, "Capacity", 1),
          num(b.starting_balance, "Starting balance"),
          b.manual_pin === null ||
          b.manual_pin === "" ||
          b.manual_pin === undefined
            ? null
            : num(b.manual_pin, "Manual pin", 1, true),
          flag(b.offline ?? 0),
        ];
      }
      let recordId = id;
      if (id)
        db.prepare(
          `UPDATE ${entity} SET ${fields.map((f) => `${f}=?`).join(",")} WHERE id=? AND pad_id=?`,
        ).run(...values, id, padId);
      else
        recordId = Number(
          db
            .prepare(
              `INSERT INTO ${entity}(pad_id,${fields.join(",")}) VALUES(?,${fields.map(() => "?").join(",")})`,
            )
            .run(padId, ...values).lastInsertRowid,
        );
      if (entity === "wells" && b.overrides !== undefined) {
        if (!Array.isArray(b.overrides)) fail("Well overrides must be a list.");
        db.prepare("DELETE FROM well_designs WHERE well_id=?").run(recordId);
        const seen = new Set<number>();
        for (const d of b.overrides) {
          if (
            !old.sand_types.some((m) => m.id === d.sand_type_id) ||
            seen.has(d.sand_type_id)
          )
            fail("Select unique sand types from this pad for overrides.");
          seen.add(d.sand_type_id);
          db.prepare("INSERT INTO well_designs VALUES(?,?,?)").run(
            recordId,
            d.sand_type_id,
            num(d.pounds, "Override pounds"),
          );
        }
      }
      return validBalances(db, padId);
    })();
    res.json(p);
  });
  for (const entity of ["silos", "wells"] as const)
    app.delete(`/api/setup/${entity}/:id`, (req, res) => {
      const id = res.locals.padId;
      const p = db.transaction(() => {
        const record = num(Number(req.params.id), "Record", 1, true);
        const old = db
          .prepare(
            `SELECT * FROM ${entity} WHERE id=? AND pad_id=? AND deleted_at IS NULL`,
          )
          .get(record, id);
        if (!old) fail("Record not found.", 404);
        const history =
          entity === "silos"
            ? db
                .prepare(
                  "SELECT 1 FROM deliveries WHERE silo_id=? UNION ALL SELECT 1 FROM runs WHERE silo_id=? LIMIT 1",
                )
                .get(record, record)
            : db
                .prepare("SELECT 1 FROM runs WHERE well_id=? LIMIT 1")
                .get(record);
        if (history && req.body?.confirm_history !== true)
          fail(
            "This record has tickets or runs. Confirm removal from the active job; ledger rows will be retained.",
            409,
          );
        db.prepare(
          `UPDATE ${entity} SET deleted_at=? WHERE id=? AND pad_id=?`,
        ).run(new Date().toISOString(), record, id);
        if (entity === "wells")
          db.prepare(
            "UPDATE settings SET current_well_id=NULL,current_stage=1 WHERE id=? AND current_well_id=?",
          ).run(id, record);
        return snapshot(db, id);
      })();
      res.json(p);
    });
  app.post("/api/suppliers", (req, res) => {
    const id = res.locals.padId;
    db.prepare(
      "INSERT INTO suppliers(pad_id,name) VALUES(?,?) ON CONFLICT(pad_id,name) DO NOTHING",
    ).run(id, str(req.body.name, "Supplier name"));
    res.status(201).json(snapshot(db, id));
  });
  app.delete("/api/suppliers/:id", (req, res) => {
    if (
      !db
        .prepare("DELETE FROM suppliers WHERE id=? AND pad_id=?")
        .run(num(Number(req.params.id), "Supplier", 1, true), res.locals.padId)
        .changes
    )
      fail("Supplier not found.", 404);
    res.json(snapshot(db, res.locals.padId));
  });
}
export function afterRun(
  db: Database.Database,
  padId: number,
  wellId: number,
  stage: number,
) {
  const p = snapshot(db, padId);
  if (p.settings.clear_pins) {
    const designs = db
      .prepare(
        "SELECT sand_type_id,design_pounds FROM stage_designs WHERE well_id=? AND stage=?",
      )
      .all(wellId, stage) as { sand_type_id: number; design_pounds: number }[];
    if (
      designs.length &&
      designs.every(
        (d) =>
          p.runs
            .filter(
              (r) =>
                r.well_id === wellId &&
                r.stage === stage &&
                r.sand_type_id === d.sand_type_id,
            )
            .reduce((n, r) => n + r.pounds, 0) >= d.design_pounds,
      )
    )
      db.prepare(
        "UPDATE silos SET manual_pin=NULL WHERE pad_id=? AND deleted_at IS NULL",
      ).run(padId);
  }
  if (!p.settings.auto_advance)
    db.prepare(
      "UPDATE settings SET current_well_id=?,current_stage=? WHERE id=?",
    ).run(wellId, stage, padId);
}
