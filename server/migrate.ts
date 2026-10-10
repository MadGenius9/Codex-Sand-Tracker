import type Database from "better-sqlite3";

// Rebuild the legacy global UNIQUE constraints as per-pad constraints, preserving IDs.
export function migrate(db: Database.Database, freshDemo: boolean) {
  if (Number(db.pragma("user_version", { simple: true })) >= 2) return;
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(`CREATE TABLE pads(id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE COLLATE NOCASE);
 INSERT INTO pads VALUES(1,'Demo pad');
 CREATE TABLE wells_new(id INTEGER PRIMARY KEY,pad_id INTEGER NOT NULL REFERENCES pads(id),name TEXT NOT NULL,customer TEXT NOT NULL,planned_stages INTEGER NOT NULL CHECK(planned_stages>0));
 INSERT INTO wells_new SELECT id,1,name,customer,planned_stages FROM wells;
 CREATE TABLE sand_types_new(id INTEGER PRIMARY KEY,pad_id INTEGER NOT NULL REFERENCES pads(id),name TEXT NOT NULL,design_pounds REAL NOT NULL CHECK(design_pounds>0),UNIQUE(pad_id,name));
 INSERT INTO sand_types_new SELECT id,1,name,design_pounds FROM sand_types;
 CREATE TABLE silos_new(id INTEGER PRIMARY KEY,pad_id INTEGER NOT NULL REFERENCES pads(id),number INTEGER NOT NULL,side TEXT NOT NULL CHECK(side IN ('A','B')),sand_type_id INTEGER NOT NULL REFERENCES sand_types(id),capacity REAL NOT NULL CHECK(capacity>0),starting_balance REAL NOT NULL CHECK(starting_balance>=0),manual_pin INTEGER CHECK(manual_pin>0),offline INTEGER NOT NULL CHECK(offline IN (0,1)),UNIQUE(pad_id,number));
 INSERT INTO silos_new SELECT id,1,number,side,sand_type_id,capacity,starting_balance,manual_pin,offline FROM silos;
 CREATE TABLE deliveries_new(id INTEGER PRIMARY KEY,pad_id INTEGER NOT NULL REFERENCES pads(id),date TEXT NOT NULL,ticket_number TEXT NOT NULL,supplier TEXT NOT NULL,product_code TEXT NOT NULL,sand_type_id INTEGER NOT NULL REFERENCES sand_types(id),pounds REAL NOT NULL CHECK(pounds>0),silo_id INTEGER NOT NULL REFERENCES silos(id),voided_at TEXT);
 INSERT INTO deliveries_new SELECT id,1,date,ticket_number,supplier,product_code,sand_type_id,pounds,silo_id,NULL FROM deliveries;
 CREATE TABLE runs_new(id INTEGER PRIMARY KEY,pad_id INTEGER NOT NULL REFERENCES pads(id),date TEXT NOT NULL DEFAULT '',well_id INTEGER NOT NULL REFERENCES wells(id),stage INTEGER NOT NULL CHECK(stage>0),sand_type_id INTEGER NOT NULL REFERENCES sand_types(id),pounds REAL NOT NULL CHECK(pounds>0),silo_id INTEGER NOT NULL REFERENCES silos(id),voided_at TEXT);
 INSERT INTO runs_new SELECT id,1,'',well_id,stage,sand_type_id,pounds,silo_id,NULL FROM runs;
 CREATE TABLE settings_new(id INTEGER PRIMARY KEY REFERENCES pads(id),reserve REAL NOT NULL CHECK(reserve>=0),strategy TEXT NOT NULL CHECK(strategy='sequential'));
 INSERT INTO settings_new SELECT * FROM settings;
 DROP TABLE runs; DROP TABLE deliveries; DROP TABLE silos; DROP TABLE sand_types; DROP TABLE wells; DROP TABLE settings;
 ALTER TABLE wells_new RENAME TO wells; ALTER TABLE sand_types_new RENAME TO sand_types; ALTER TABLE silos_new RENAME TO silos; ALTER TABLE deliveries_new RENAME TO deliveries; ALTER TABLE runs_new RENAME TO runs; ALTER TABLE settings_new RENAME TO settings;
 CREATE INDEX ticket_number_idx ON deliveries(pad_id,ticket_number COLLATE NOCASE);
 CREATE INDEX runs_stage_idx ON runs(pad_id,well_id,stage,sand_type_id);
 CREATE TABLE stage_designs(pad_id INTEGER NOT NULL REFERENCES pads(id),well_id INTEGER NOT NULL REFERENCES wells(id),stage INTEGER NOT NULL,sand_type_id INTEGER NOT NULL REFERENCES sand_types(id),design_pounds REAL NOT NULL CHECK(design_pounds>0),PRIMARY KEY(well_id,stage,sand_type_id));
 INSERT INTO stage_designs SELECT DISTINCT r.pad_id,r.well_id,r.stage,m.id,m.design_pounds FROM runs r JOIN sand_types m ON m.pad_id=r.pad_id;
 CREATE TABLE product_map(id INTEGER PRIMARY KEY,pad_id INTEGER NOT NULL REFERENCES pads(id),supplier TEXT NOT NULL COLLATE NOCASE,product_code TEXT NOT NULL COLLATE NOCASE,sand_type_id INTEGER NOT NULL REFERENCES sand_types(id),UNIQUE(pad_id,supplier,product_code));
 CREATE TABLE ledger_edits(id INTEGER PRIMARY KEY,pad_id INTEGER NOT NULL REFERENCES pads(id),entity TEXT NOT NULL,record_id INTEGER NOT NULL,action TEXT NOT NULL,before_json TEXT NOT NULL,changed_at TEXT NOT NULL);
 PRAGMA user_version=2;`);
      if (freshDemo)
        db.prepare("UPDATE runs SET date=?").run(
          new Date().toLocaleDateString("en-CA"),
        );
      if ((db.pragma("foreign_key_check") as unknown[]).length)
        throw new Error("Migration foreign-key validation failed.");
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}
export function captureDesign(
  db: Database.Database,
  padId: number,
  wellId: number,
  stage: number,
) {
  // A stage captures the entire mesh design only on its first run.
  if (
    !db
      .prepare("SELECT 1 FROM stage_designs WHERE well_id=? AND stage=?")
      .get(wellId, stage)
  )
    db.prepare(
      "INSERT INTO stage_designs SELECT m.pad_id,?,?,m.id,COALESCE(d.pounds,m.design_pounds) FROM sand_types m LEFT JOIN well_designs d ON d.sand_type_id=m.id AND d.well_id=? WHERE m.pad_id=?",
    ).run(wellId, stage, wellId, padId);
}
