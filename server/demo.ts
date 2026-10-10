import type Database from "better-sqlite3";

// Retire only the untouched original sample equipment, never a configured job.
export function reduceOriginalDemo(db: Database.Database) {
  const pad = db.prepare("SELECT * FROM pads WHERE id=1").get() as
    { name: string; customer: string } | undefined;
  if (pad?.name !== "Demo pad" || pad.customer) return;
  const silos = db
    .prepare(
      "SELECT * FROM silos WHERE pad_id=1 AND deleted_at IS NULL ORDER BY number",
    )
    .all() as {
    id: number;
    number: number;
    side: string;
    sand_type_id: number;
    capacity: number;
    starting_balance: number;
    name: string;
    manual_pin: number | null;
    offline: number;
  }[];
  const balances = [
    184000, 162000, 142000, 118000, 80000, 24000, 196000, 175000, 153000,
    132000, 104000, 52000,
  ];
  if (
    silos.length !== 12 ||
    !silos.every(
      (s, i) =>
        s.id === i + 1 &&
        s.number === i + 1 &&
        s.side === (i < 6 ? "A" : "B") &&
        s.sand_type_id === (i < 6 ? 1 : 2) &&
        s.capacity === 250000 &&
        s.starting_balance === balances[i] &&
        !s.name &&
        s.manual_pin === null &&
        s.offline === (i === 11 ? 1 : 0),
    )
  )
    return;
  const wells = db
    .prepare("SELECT name,planned_stages FROM wells WHERE pad_id=1")
    .all() as { name: string; planned_stages: number }[];
  if (
    wells.length !== 2 ||
    !wells.every(
      (w, i) => w.name === `Hawthorne 0${i + 1}H` && w.planned_stages === 40,
    )
  )
    return;
  const counts = db
    .prepare(
      "SELECT (SELECT COUNT(*) FROM deliveries WHERE pad_id=1) AS deliveries,(SELECT COUNT(*) FROM runs WHERE pad_id=1) AS runs,(SELECT COUNT(*) FROM well_designs) AS overrides",
    )
    .get() as { deliveries: number; runs: number; overrides: number };
  if (counts.deliveries !== 2 || counts.runs !== 2 || counts.overrides) return;
  db.prepare(
    "UPDATE silos SET deleted_at=? WHERE pad_id=1 AND id IN (4,5,6,9,10,11)",
  ).run(new Date().toISOString());
}
