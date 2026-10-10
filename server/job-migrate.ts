import type Database from "better-sqlite3";
export function migrateJob(db: Database.Database) {
  const version = Number(db.pragma("user_version", { simple: true }));
  if (version >= 4) return;
  if (version === 3) {
    db.pragma("foreign_keys = OFF");
    try {
      db.transaction(() => {
        db.exec(`CREATE TABLE stage_designs_zero(pad_id INTEGER NOT NULL REFERENCES pads(id),well_id INTEGER NOT NULL REFERENCES wells(id),stage INTEGER NOT NULL,sand_type_id INTEGER NOT NULL REFERENCES sand_types(id),design_pounds REAL NOT NULL CHECK(design_pounds>=0),PRIMARY KEY(well_id,stage,sand_type_id));
    INSERT INTO stage_designs_zero SELECT * FROM stage_designs;
    DROP TABLE stage_designs; ALTER TABLE stage_designs_zero RENAME TO stage_designs;
    PRAGMA user_version=4;`);
        if ((db.pragma("foreign_key_check") as unknown[]).length)
          throw Error("Design migration foreign-key validation failed.");
      })();
    } finally {
      db.pragma("foreign_keys = ON");
    }
    return;
  }
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(`ALTER TABLE pads ADD COLUMN customer TEXT NOT NULL DEFAULT '';
 ALTER TABLE wells ADD COLUMN toe_stage INTEGER CHECK(toe_stage IN (0,1));
 ALTER TABLE wells ADD COLUMN deleted_at TEXT;
 ALTER TABLE sand_types ADD COLUMN job_total REAL NOT NULL DEFAULT 0 CHECK(job_total>=0);
 UPDATE sand_types SET job_total=design_pounds*COALESCE((SELECT SUM(planned_stages) FROM wells WHERE wells.pad_id=sand_types.pad_id),0);
 ALTER TABLE silos ADD COLUMN name TEXT NOT NULL DEFAULT '';
 ALTER TABLE silos ADD COLUMN deleted_at TEXT;
 CREATE TABLE stage_designs_job(pad_id INTEGER NOT NULL REFERENCES pads(id),well_id INTEGER NOT NULL REFERENCES wells(id),stage INTEGER NOT NULL,sand_type_id INTEGER NOT NULL REFERENCES sand_types(id),design_pounds REAL NOT NULL CHECK(design_pounds>=0),PRIMARY KEY(well_id,stage,sand_type_id));
 INSERT INTO stage_designs_job SELECT * FROM stage_designs;
 DROP TABLE stage_designs; ALTER TABLE stage_designs_job RENAME TO stage_designs;
 CREATE TABLE settings_job(id INTEGER PRIMARY KEY REFERENCES pads(id),reserve REAL NOT NULL CHECK(reserve>=0),strategy TEXT NOT NULL CHECK(strategy IN ('sequential','partials','least_used','emptiest','fullest','pairs')),pounds_per_ton REAL NOT NULL DEFAULT 2000 CHECK(pounds_per_ton>0),pounds_per_truckload REAL NOT NULL DEFAULT 57000 CHECK(pounds_per_truckload>0),clear_pins INTEGER NOT NULL DEFAULT 0 CHECK(clear_pins IN (0,1)),auto_advance INTEGER NOT NULL DEFAULT 1 CHECK(auto_advance IN (0,1)),toe_stage INTEGER NOT NULL DEFAULT 0 CHECK(toe_stage IN (0,1)),current_well_id INTEGER REFERENCES wells(id),current_stage INTEGER NOT NULL DEFAULT 1 CHECK(current_stage>=0));
 INSERT INTO settings_job(id,reserve,strategy) SELECT id,reserve,strategy FROM settings;
 DROP TABLE settings; ALTER TABLE settings_job RENAME TO settings;
 CREATE TABLE runs_job(id INTEGER PRIMARY KEY,pad_id INTEGER NOT NULL REFERENCES pads(id),date TEXT NOT NULL DEFAULT '',well_id INTEGER NOT NULL REFERENCES wells(id),stage INTEGER NOT NULL CHECK(stage>=0),sand_type_id INTEGER NOT NULL REFERENCES sand_types(id),pounds REAL NOT NULL CHECK(pounds>0),silo_id INTEGER NOT NULL REFERENCES silos(id),voided_at TEXT);
 INSERT INTO runs_job SELECT * FROM runs;
 DROP TABLE runs; ALTER TABLE runs_job RENAME TO runs;
 CREATE INDEX runs_stage_idx ON runs(pad_id,well_id,stage,sand_type_id);
 CREATE TABLE well_designs(well_id INTEGER NOT NULL REFERENCES wells(id),sand_type_id INTEGER NOT NULL REFERENCES sand_types(id),pounds REAL NOT NULL CHECK(pounds>=0),PRIMARY KEY(well_id,sand_type_id));
 CREATE TABLE suppliers(id INTEGER PRIMARY KEY,pad_id INTEGER NOT NULL REFERENCES pads(id),name TEXT NOT NULL COLLATE NOCASE,UNIQUE(pad_id,name));
 INSERT INTO suppliers(pad_id,name) SELECT pad_id,TRIM(supplier) FROM deliveries WHERE TRIM(supplier)<>'' GROUP BY pad_id,LOWER(TRIM(supplier));
 CREATE TABLE mine_codes(id INTEGER PRIMARY KEY,pad_id INTEGER NOT NULL REFERENCES pads(id),product_code TEXT NOT NULL COLLATE NOCASE,sand_type_id INTEGER NOT NULL REFERENCES sand_types(id),UNIQUE(pad_id,product_code));
 INSERT INTO mine_codes(pad_id,product_code,sand_type_id) SELECT pad_id,product_code,MIN(sand_type_id) FROM product_map GROUP BY pad_id,LOWER(product_code) HAVING COUNT(DISTINCT sand_type_id)=1;
 PRAGMA user_version=4;`);
      if ((db.pragma("foreign_key_check") as unknown[]).length)
        throw Error("Job migration foreign-key validation failed.");
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}
