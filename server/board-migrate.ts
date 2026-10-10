import type Database from "better-sqlite3";
export function migrateBoard(db: Database.Database) {
  const version = Number(db.pragma("user_version", { simple: true }));
  if (version >= 7) return;
  if (version === 6) {
    db.transaction(() =>
      db.exec(
        "ALTER TABLE pads ADD COLUMN job_names TEXT NOT NULL DEFAULT '[]'; PRAGMA user_version=7;",
      ),
    )();
    return;
  }
  db.transaction(() =>
    db.exec(`ALTER TABLE pads ADD COLUMN job_name TEXT NOT NULL DEFAULT '';
ALTER TABLE pads ADD COLUMN shift_names TEXT NOT NULL DEFAULT '[]';
ALTER TABLE pads ADD COLUMN active_shift TEXT NOT NULL DEFAULT '';
ALTER TABLE pads ADD COLUMN job_names TEXT NOT NULL DEFAULT '[]';
ALTER TABLE sand_types ADD COLUMN color TEXT NOT NULL DEFAULT '#38bdf8';
UPDATE sand_types SET color=CASE WHEN id%3=1 THEN '#38bdf8' WHEN id%3=2 THEN '#a78bfa' ELSE '#34d399' END;
PRAGMA user_version=7;`),
  )();
}
