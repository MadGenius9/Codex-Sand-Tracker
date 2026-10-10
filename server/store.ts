import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Well, Sand, Silo, Delivery, Run, Pad, Plan } from "../src/types";
import { migrate } from "./migrate";
import { migrateJob } from "./job-migrate";

export function openStore(file: string, seed = true) {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`CREATE TABLE IF NOT EXISTS wells(id INTEGER PRIMARY KEY,name TEXT NOT NULL,customer TEXT NOT NULL,planned_stages INTEGER NOT NULL CHECK(planned_stages>0));
 CREATE TABLE IF NOT EXISTS sand_types(id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE,design_pounds REAL NOT NULL CHECK(design_pounds>0));
 CREATE TABLE IF NOT EXISTS silos(id INTEGER PRIMARY KEY,number INTEGER NOT NULL UNIQUE,side TEXT NOT NULL CHECK(side IN ('A','B')),sand_type_id INTEGER NOT NULL REFERENCES sand_types(id),capacity REAL NOT NULL CHECK(capacity>0),starting_balance REAL NOT NULL CHECK(starting_balance>=0),manual_pin INTEGER CHECK(manual_pin>0),offline INTEGER NOT NULL DEFAULT 0 CHECK(offline IN (0,1)));
 CREATE TABLE IF NOT EXISTS deliveries(id INTEGER PRIMARY KEY,date TEXT NOT NULL,ticket_number TEXT NOT NULL,supplier TEXT NOT NULL,product_code TEXT NOT NULL,sand_type_id INTEGER NOT NULL REFERENCES sand_types(id),pounds REAL NOT NULL CHECK(pounds>0),silo_id INTEGER NOT NULL REFERENCES silos(id));
 CREATE INDEX IF NOT EXISTS ticket_number_idx ON deliveries(ticket_number COLLATE NOCASE);
 CREATE TABLE IF NOT EXISTS runs(id INTEGER PRIMARY KEY,well_id INTEGER NOT NULL REFERENCES wells(id),stage INTEGER NOT NULL CHECK(stage>0),sand_type_id INTEGER NOT NULL REFERENCES sand_types(id),pounds REAL NOT NULL CHECK(pounds>0),silo_id INTEGER NOT NULL REFERENCES silos(id));
 CREATE INDEX IF NOT EXISTS runs_stage_idx ON runs(well_id,stage,sand_type_id);
 CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),reserve REAL NOT NULL CHECK(reserve>=0),strategy TEXT NOT NULL CHECK(strategy='sequential'));
 INSERT OR IGNORE INTO settings(id,reserve,strategy) VALUES(1,5,'sequential');`);
  const freshDemo =
    seed &&
    !db.prepare("SELECT id FROM wells LIMIT 1").get() &&
    Number(db.pragma("user_version", { simple: true })) === 0;
  if (freshDemo)
    db.transaction(() => {
      db.prepare("INSERT INTO wells VALUES(1,?,?,?)").run(
        "Hawthorne 01H",
        "Northline Energy",
        40,
      );
      db.prepare("INSERT INTO wells VALUES(2,?,?,?)").run(
        "Hawthorne 02H",
        "Northline Energy",
        40,
      );
      db.prepare("INSERT INTO sand_types VALUES(1,?,?)").run("100 mesh", 80000);
      db.prepare("INSERT INTO sand_types VALUES(2,?,?)").run("40/70", 60000);
      for (let i = 1; i <= 12; i++)
        db.prepare("INSERT INTO silos VALUES(?,?,?,?,?,?,?,?)").run(
          i,
          i,
          i <= 6 ? "A" : "B",
          i <= 6 ? 1 : 2,
          250000,
          [
            184000, 162000, 142000, 118000, 80000, 24000, 196000, 175000,
            153000, 132000, 104000, 52000,
          ][i - 1],
          null,
          i === 12 ? 1 : 0,
        );
      const today = new Date().toLocaleDateString("en-CA");
      db.prepare("INSERT INTO deliveries VALUES(1,?,?,?,?,?,?,?)").run(
        today,
        "SP-1048",
        "Atlas Sand",
        "100M",
        1,
        48000,
        1,
      );
      db.prepare("INSERT INTO deliveries VALUES(2,?,?,?,?,?,?,?)").run(
        today,
        "SP-1049",
        "Atlas Sand",
        "4070",
        2,
        46000,
        7,
      );
      db.prepare("INSERT INTO runs VALUES(1,1,1,1,80000,1)").run();
      db.prepare("INSERT INTO runs VALUES(2,1,1,2,60000,7)").run();
    })();
  migrate(db, freshDemo);
  migrateJob(db);
  return db;
}

export function snapshot(db: Database.Database, padId = 1): Pad {
  const pad = db
    .prepare("SELECT * FROM pads WHERE id=?")
    .get(padId) as Pad["pad"];
  if (!pad) throw Object.assign(new Error("Pad not found."), { status: 404 });
  const pads = db
    .prepare("SELECT * FROM pads ORDER BY id")
    .all() as Pad["pads"];
  const all_wells = db
    .prepare("SELECT * FROM wells WHERE pad_id=? ORDER BY id")
    .all(padId) as Well[];
  const overrides = db
    .prepare(
      "SELECT d.* FROM well_designs d JOIN wells w ON w.id=d.well_id WHERE w.pad_id=?",
    )
    .all(padId) as { well_id: number; sand_type_id: number; pounds: number }[];
  all_wells.forEach(
    (w) =>
      (w.overrides = overrides
        .filter((d) => d.well_id === w.id)
        .map((d) => ({ sand_type_id: d.sand_type_id, pounds: d.pounds }))),
  );
  const wells = all_wells.filter((w) => !w.deleted_at);
  const sand_types = db
    .prepare("SELECT * FROM sand_types WHERE pad_id=? ORDER BY id")
    .all(padId) as Sand[];
  const allDeliveries = db
    .prepare(
      "SELECT * FROM deliveries WHERE pad_id=? ORDER BY date DESC,id DESC",
    )
    .all(padId) as Delivery[];
  const allRuns = db
    .prepare("SELECT * FROM runs WHERE pad_id=? ORDER BY id")
    .all(padId) as Run[];
  const deliveries = allDeliveries.filter((r) => !r.voided_at);
  const runs = allRuns.filter((r) => !r.voided_at);
  const settings = db
    .prepare("SELECT * FROM settings WHERE id=?")
    .get(padId) as Pad["settings"];
  const all_silos = (
    db
      .prepare(
        `SELECT s.*,s.starting_balance+COALESCE((SELECT SUM(pounds) FROM deliveries WHERE silo_id=s.id AND voided_at IS NULL),0)-COALESCE((SELECT SUM(pounds) FROM runs WHERE silo_id=s.id AND voided_at IS NULL),0) AS on_hand FROM silos s WHERE pad_id=? ORDER BY number`,
      )
      .all(padId) as Silo[]
  ).map(
    (s) =>
      ({
        ...s,
        percent: (s.on_hand / s.capacity) * 100,
        stages_left:
          s.on_hand /
          sand_types.find((m) => m.id === s.sand_type_id)!.design_pounds,
        run_order: null,
        planned_pull: 0,
        pin_conflict: false,
      }) as Silo,
  );
  const silos = all_silos.filter((s) => !s.deleted_at);
  let next: Pad["next"] = null;
  const designs = db
    .prepare("SELECT * FROM stage_designs WHERE pad_id=?")
    .all(padId) as {
    well_id: number;
    stage: number;
    sand_type_id: number;
    design_pounds: number;
  }[];
  const required = (well: number, stage: number, mesh: Sand) =>
    designs.find(
      (d) =>
        d.well_id === well && d.stage === stage && d.sand_type_id === mesh.id,
    )?.design_pounds ??
    (designs.some((d) => d.well_id === well && d.stage === stage)
      ? 0
      : (overrides.find((d) => d.well_id === well && d.sand_type_id === mesh.id)
          ?.pounds ?? mesh.design_pounds));
  outer: for (const well of wells)
    for (
      let stage = (well.toe_stage ?? settings.toe_stage) ? 0 : 1;
      stage <= well.planned_stages;
      stage++
    ) {
      if (
        sand_types.some(
          (m) =>
            runs
              .filter(
                (r) =>
                  r.well_id === well.id &&
                  r.stage === stage &&
                  r.sand_type_id === m.id,
              )
              .reduce((n, r) => n + r.pounds, 0) < required(well.id, stage, m),
        )
      ) {
        next = { well, stage, plans: [] };
        break outer;
      }
    }
  if (!settings.auto_advance) {
    const well =
      wells.find((w) => w.id === settings.current_well_id) ??
      next?.well ??
      wells[0];
    if (well)
      next = {
        well,
        stage:
          settings.current_well_id === well.id
            ? Math.min(settings.current_stage, well.planned_stages)
            : (next?.stage ?? ((well.toe_stage ?? settings.toe_stage) ? 0 : 1)),
        plans: [],
      };
  }
  for (const mesh of sand_types) {
    const online = silos.filter(
      (s) => s.sand_type_id === mesh.id && !s.offline,
    );
    const last = runs.filter((r) => r.sand_type_id === mesh.id).at(-1);
    const index = online.findIndex((s) => s.id === last?.silo_id);
    const rotated =
      index < 0
        ? online
        : [...online.slice(index + 1), ...online.slice(0, index + 1)];
    let strategyOrder = rotated;
    const used = (id: number) =>
      runs.filter((r) => r.silo_id === id).reduce((n, r) => n + r.pounds, 0);
    if (settings.strategy === "partials")
      strategyOrder = [
        ...rotated.filter((s) => s.on_hand > 0 && s.on_hand < s.capacity),
        ...rotated.filter((s) => !(s.on_hand > 0 && s.on_hand < s.capacity)),
      ];
    if (settings.strategy === "least_used")
      strategyOrder = [...rotated].sort((a, b) => used(a.id) - used(b.id));
    if (settings.strategy === "emptiest")
      strategyOrder = [...rotated].sort((a, b) => a.percent - b.percent);
    if (settings.strategy === "fullest")
      strategyOrder = [...rotated].sort((a, b) => b.percent - a.percent);
    if (settings.strategy === "pairs") {
      const paired: number[] = [];
      for (const position of [6, 2, 5, 1, 4, 3])
        for (const side of ["A", "B"]) {
          const s = silos
            .filter((s) => s.side === side)
            .sort((a, b) => a.number - b.number)[position - 1];
          if (s) paired.push(s.id);
        }
      strategyOrder = [...online].sort(
        (a, b) =>
          (paired.indexOf(a.id) < 0 ? 999 : paired.indexOf(a.id)) -
          (paired.indexOf(b.id) < 0 ? 999 : paired.indexOf(b.id)),
      );
    }
    const order = strategyOrder
      .map((s, i) => ({ s, i }))
      .sort(
        (a, b) =>
          (a.s.manual_pin ?? Infinity) - (b.s.manual_pin ?? Infinity) ||
          a.i - b.i,
      )
      .map((x) => x.s);
    order.forEach((s, i) => {
      s.run_order = i + 1;
      s.pin_conflict =
        s.manual_pin !== null &&
        online.filter((t) => t.manual_pin === s.manual_pin).length > 1;
    });
    if (next) {
      const recorded = runs
        .filter(
          (r) =>
            r.well_id === next!.well.id &&
            r.stage === next!.stage &&
            r.sand_type_id === mesh.id,
        )
        .reduce((n, r) => n + r.pounds, 0);
      const design = required(next.well.id, next.stage, mesh);
      let remaining = Math.max(0, design - recorded);
      const plan: Plan = {
        sand_type_id: mesh.id,
        required: design,
        recorded,
        remaining,
        shortfall: 0,
        pulls: [],
      };
      for (const silo of order) {
        const pounds = Math.min(remaining, Math.max(0, silo.on_hand));
        silo.planned_pull = pounds;
        if (pounds > 0) plan.pulls.push({ silo_id: silo.id, pounds });
        remaining -= pounds;
      }
      plan.shortfall = remaining;
      next.plans.push(plan);
    }
  }
  const totals = sand_types.map((m) => {
    const group = silos.filter((s) => s.sand_type_id === m.id);
    const pounds = group.reduce((n, s) => n + s.on_hand, 0);
    const available = group
      .filter((s) => !s.offline)
      .reduce((n, s) => n + s.on_hand, 0);
    return {
      sand_type_id: m.id,
      pounds,
      available,
      stages: available / m.design_pounds,
      reorder: available / m.design_pounds < settings.reserve,
    };
  });
  const stage_history: Pad["stage_history"] = [];
  for (const well of all_wells) {
    const stages = [
      ...new Set([
        ...allRuns.filter((r) => r.well_id === well.id).map((r) => r.stage),
        ...designs.filter((d) => d.well_id === well.id).map((d) => d.stage),
      ]),
    ].sort((a, b) => b - a);
    for (const stage of stages) {
      const captured = designs.filter(
        (d) => d.well_id === well.id && d.stage === stage,
      );
      const meshes = captured.map((d) => {
        const pumped = runs
          .filter(
            (r) =>
              r.well_id === well.id &&
              r.stage === stage &&
              r.sand_type_id === d.sand_type_id,
          )
          .reduce((n, r) => n + r.pounds, 0);
        return {
          sand_type_id: d.sand_type_id,
          pumped,
          design: d.design_pounds,
          short: pumped < d.design_pounds,
        };
      });
      stage_history.push({
        well_id: well.id,
        stage,
        meshes,
        pumped: meshes.reduce((n, m) => n + m.pumped, 0),
        design: meshes.reduce((n, m) => n + m.design, 0),
        short: meshes.some((m) => m.short),
      });
    }
  }
  const product_map = db
    .prepare(
      "SELECT id,'' AS supplier,product_code,sand_type_id FROM mine_codes WHERE pad_id=? ORDER BY product_code",
    )
    .all(padId) as Pad["product_map"];
  return {
    pad,
    pads,
    ledger: { deliveries: allDeliveries, runs: allRuns },
    stage_history,
    product_map,
    suppliers: db
      .prepare("SELECT id,name FROM suppliers WHERE pad_id=? ORDER BY name")
      .all(padId) as Pad["suppliers"],
    all_wells,
    all_silos,
    job_design: sand_types.map((m) => ({
      sand_type_id: m.id,
      job_total: m.job_total,
      planned: wells.reduce(
        (n, w) =>
          n +
          (w.planned_stages + ((w.toe_stage ?? settings.toe_stage) ? 1 : 0)) *
            (w.overrides.find((d) => d.sand_type_id === m.id)?.pounds ??
              m.design_pounds),
        0,
      ),
      pumped: runs
        .filter((r) => r.sand_type_id === m.id)
        .reduce((n, r) => n + r.pounds, 0),
    })),
    wells,
    sand_types,
    silos,
    deliveries,
    runs,
    settings,
    next,
    totals,
  };
}
