import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore, snapshot } from "./store";
import { createApp } from "./app";
import { migrate } from "./migrate";
import { migrateJob } from "./job-migrate";

test("legacy migration preserves ledger IDs, balances and undated runs; reopening never reseeds", () => {
  const dir = mkdtempSync(join(tmpdir(), "sand-pad-migration-")),
    file = join(dir, "legacy.sqlite");
  let db = new Database(file);
  try {
    db.exec(`CREATE TABLE wells(id INTEGER PRIMARY KEY,name TEXT,customer TEXT,planned_stages INTEGER); INSERT INTO wells VALUES(7,'Legacy well','Customer',5);
 CREATE TABLE sand_types(id INTEGER PRIMARY KEY,name TEXT UNIQUE,design_pounds REAL); INSERT INTO sand_types VALUES(9,'100 mesh',1000);
 CREATE TABLE silos(id INTEGER PRIMARY KEY,number INTEGER UNIQUE,side TEXT,sand_type_id INTEGER,capacity REAL,starting_balance REAL,manual_pin INTEGER,offline INTEGER); INSERT INTO silos VALUES(11,1,'A',9,10000,2000,NULL,0);
 CREATE TABLE deliveries(id INTEGER PRIMARY KEY,date TEXT,ticket_number TEXT,supplier TEXT,product_code TEXT,sand_type_id INTEGER,pounds REAL,silo_id INTEGER); INSERT INTO deliveries VALUES(21,'2026-10-01','OLD','Legacy Sand','M100',9,500,11);
 CREATE TABLE runs(id INTEGER PRIMARY KEY,well_id INTEGER,stage INTEGER,sand_type_id INTEGER,pounds REAL,silo_id INTEGER); INSERT INTO runs VALUES(31,7,1,9,1000,11);
 CREATE TABLE settings(id INTEGER PRIMARY KEY,reserve REAL,strategy TEXT); INSERT INTO settings VALUES(1,4,'sequential');`);
    migrate(db, false);
    migrateJob(db);
    const p = snapshot(db);
    assert.equal(p.silos[0].on_hand, 1500);
    assert.equal(p.deliveries[0].id, 21);
    assert.equal(p.runs[0].id, 31);
    assert.equal(p.runs[0].date, "");
    assert.equal(p.stage_history[0].short, false);
    assert.equal(p.settings.reserve, 4);
    assert.deepEqual(db.pragma("foreign_key_check"), []);
    db.close();
    db = openStore(file);
    assert.equal(snapshot(db).silos.length, 1);
    assert.equal(snapshot(db).deliveries.length, 1);
    assert.equal(snapshot(db).silos[0].on_hand, 1500);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("edit/void transactions, pad isolation, historical design, product maps and consistent SQLite download", async () => {
  const db = openStore(":memory:");
  const server = createApp(db).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const a = server.address();
  assert.ok(a && typeof a !== "string");
  const base = `http://127.0.0.1:${a.port}/api`;
  const send = async (
    path: string,
    body: unknown,
    method = "POST",
    pad = 1,
  ) => {
    const r = await fetch(`${base}/${path}?pad_id=${pad}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: r.status, data: await r.json() };
  };
  try {
    const d = snapshot(db).deliveries.find((d) => d.id === 1)!;
    let r = await send("deliveries/1", { ...d, pounds: 20000 }, "PUT");
    assert.equal(r.status, 200);
    assert.equal(r.data.silos[0].on_hand, 124000);
    const run = snapshot(db).runs.find((r) => r.id === 1)!;
    r = await send("runs/1", { ...run, pounds: 40000 }, "PUT");
    assert.equal(r.status, 200);
    assert.equal(r.data.silos[0].on_hand, 164000);
    assert.equal(r.data.next.stage, 1);
    assert.equal(r.data.stage_history[0].short, true);
    assert.equal(r.data.stage_history[0].pumped, 100000);
    r = await send("runs/1", { ...run, pounds: 999999 }, "PUT");
    assert.equal(r.status, 400);
    assert.equal(snapshot(db).silos[0].on_hand, 164000);
    assert.equal(
      (db.prepare("SELECT COUNT(*) n FROM ledger_edits").get() as { n: number })
        .n,
      2,
    );
    r = await send("deliveries/1/void", {});
    assert.equal(r.status, 200);
    assert.equal(r.data.silos[0].on_hand, 144000);
    assert.equal(r.data.deliveries.length, 1);
    assert.ok(
      r.data.ledger.deliveries.find((d: { id: number }) => d.id === 1)
        .voided_at,
    );
    r = await send("runs/1/void", {});
    assert.equal(r.status, 200);
    assert.equal(r.data.silos[0].on_hand, 184000);
    assert.equal(r.data.stage_history[0].pumped, 60000);
    assert.equal((await send("runs/1", { ...run }, "PUT")).status, 400);
    const mesh = snapshot(db).sand_types[0];
    r = await send("setup/sand_types", { ...mesh, design_pounds: 90000 });
    assert.equal(r.status, 200);
    assert.equal(r.data.stage_history[0].design, 140000);
    assert.equal(r.data.next.plans[0].required, 80000);
    r = await send("pads", { name: "North pad", copy_setup: true });
    assert.equal(r.status, 201);
    const p2 = r.data;
    assert.equal(p2.pad.id, 2);
    assert.equal(p2.deliveries.length, 0);
    assert.equal(p2.runs.length, 0);
    assert.ok(p2.silos.every((s: { on_hand: number }) => s.on_hand === 0));
    assert.equal(snapshot(db).silos[0].on_hand, 184000);
    assert.equal((await send("deliveries/2/void", {}, "POST", 2)).status, 404);
    assert.equal(
      (await send("setup/silos", { ...snapshot(db).silos[0] }, "POST", 2))
        .status,
      404,
    );
    assert.equal(
      (await send("deliveries", { ...d, ticket_number: "PAD2" }, "POST", 2))
        .status,
      400,
    );
    const silo = p2.silos[0];
    r = await send(
      "deliveries",
      {
        ...d,
        silo_id: silo.id,
        sand_type_id: silo.sand_type_id,
        ticket_number: "SP-1049",
        pounds: 1000,
        remember_product: true,
      },
      "POST",
      2,
    );
    assert.equal(r.status, 201);
    assert.equal(r.data.product_map.length, 1);
    assert.equal(snapshot(db).product_map.length, 0);
    r = await send(
      "product-map",
      {
        supplier: "atlas sand",
        product_code: "100m",
        sand_type_id: silo.sand_type_id,
      },
      "POST",
      2,
    );
    assert.equal(r.data.product_map.length, 1);
    assert.equal(
      (
        await send(
          "product-map",
          { supplier: "X", product_code: "X", sand_type_id: mesh.id },
          "POST",
          2,
        )
      ).status,
      400,
    );
    const backup = await fetch(`${base}/database?pad_id=2`);
    assert.equal(backup.status, 200);
    assert.match(
      backup.headers.get("content-disposition") ?? "",
      /sand-pad.sqlite/,
    );
    const bytes = Buffer.from(await backup.arrayBuffer());
    assert.equal(bytes.subarray(0, 16).toString(), "SQLite format 3\0");
    const dir = mkdtempSync(join(tmpdir(), "sand-pad-download-"));
    try {
      const f = join(dir, "backup.sqlite");
      writeFileSync(f, bytes);
      const saved = new Database(f, { readonly: true });
      try {
        assert.equal(
          (saved.prepare("SELECT COUNT(*) n FROM pads").get() as { n: number })
            .n,
          2,
        );
        assert.equal(snapshot(saved).silos[0].on_hand, 184000);
        assert.equal(snapshot(saved, 2).deliveries.length, 1);
        assert.deepEqual(saved.pragma("integrity_check"), [
          { integrity_check: "ok" },
        ]);
        assert.equal(
          (
            saved.prepare("SELECT COUNT(*) n FROM ledger_edits").get() as {
              n: number;
            }
          ).n,
          4,
        );
      } finally {
        saved.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    db.close();
  }
});
