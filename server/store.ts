import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Well, Sand, Silo, Delivery, Run, Pad, Plan } from "../src/types";

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
 INSERT OR IGNORE INTO settings VALUES(1,5,'sequential');`);
  if (seed && !db.prepare("SELECT id FROM wells LIMIT 1").get())
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
  return db;
}

export function snapshot(db: Database.Database): Pad {
  const wells = db.prepare("SELECT * FROM wells ORDER BY id").all() as Well[];
  const sand_types = db
    .prepare("SELECT * FROM sand_types ORDER BY id")
    .all() as Sand[];
  const deliveries = db
    .prepare("SELECT * FROM deliveries ORDER BY id DESC")
    .all() as Delivery[];
  const runs = db.prepare("SELECT * FROM runs ORDER BY id").all() as Run[];
  const settings = db
    .prepare("SELECT reserve,strategy FROM settings WHERE id=1")
    .get() as Pad["settings"];
  const silos = (
    db
      .prepare(
        `SELECT s.*,s.starting_balance+COALESCE((SELECT SUM(pounds) FROM deliveries WHERE silo_id=s.id),0)-COALESCE((SELECT SUM(pounds) FROM runs WHERE silo_id=s.id),0) AS on_hand FROM silos s ORDER BY number`,
      )
      .all() as Silo[]
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
  let next: Pad["next"] = null;
  outer: for (const well of wells)
    for (let stage = 1; stage <= well.planned_stages; stage++) {
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
              .reduce((n, r) => n + r.pounds, 0) < m.design_pounds,
        )
      ) {
        next = { well, stage, plans: [] };
        break outer;
      }
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
    const order = rotated
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
      let remaining = Math.max(0, mesh.design_pounds - recorded);
      const plan: Plan = {
        sand_type_id: mesh.id,
        required: mesh.design_pounds,
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
  return { wells, sand_types, silos, deliveries, runs, settings, next, totals };
}
