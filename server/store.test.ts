import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore, snapshot } from "./store";
import { createApp } from "./app";

test("ledger balances, rotation, pins, offline reserve and stage completion", () => {
  const db = openStore(":memory:");
  try {
    let p = snapshot(db);
    assert.equal(p.silos.length, 6);
    assert.equal(p.silos[0].on_hand, 152000);
    assert.equal(p.next?.stage, 2);
    assert.equal(p.next?.plans[0].pulls[0].silo_id, 2);
    assert.equal(p.next?.plans[1].pulls[0].silo_id, 8);
    assert.equal(p.silos[5].run_order, null);
    db.prepare("UPDATE silos SET manual_pin=1 WHERE id IN (2,3)").run();
    p = snapshot(db);
    assert.ok(p.silos[2].pin_conflict);
    assert.ok(p.silos[1].pin_conflict);
    assert.equal(p.next?.plans[0].pulls[0].silo_id, 2);
    db.prepare("UPDATE silos SET offline=1 WHERE id=2").run();
    assert.equal(snapshot(db).silos[2].pin_conflict, false);
    db.prepare(
      "INSERT INTO runs(pad_id,well_id,stage,sand_type_id,pounds,silo_id) VALUES(1,1,2,1,40000,3)",
    ).run();
    p = snapshot(db);
    assert.equal(p.next?.stage, 2);
    assert.equal(p.next?.plans[0].remaining, 40000);
    db.prepare(
      "INSERT INTO runs(pad_id,well_id,stage,sand_type_id,pounds,silo_id) VALUES(1,1,2,1,40000,3)",
    ).run();
    assert.equal(snapshot(db).next?.stage, 2);
    db.prepare(
      "INSERT INTO runs(pad_id,well_id,stage,sand_type_id,pounds,silo_id) VALUES(1,1,2,2,60000,8)",
    ).run();
    assert.equal(snapshot(db).next?.stage, 3);
    db.prepare("UPDATE settings SET reserve=100").run();
    assert.ok(snapshot(db).totals.every((t) => t.reorder));
  } finally {
    db.close();
  }
});
test("API duplicate warning, capacity, atomic overdraw and mesh validation", async () => {
  const db = openStore(":memory:");
  const server = createApp(db).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api`;
  const post = async (path: string, body: unknown) => {
    const res = await fetch(`${base}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, data: await res.json() };
  };
  try {
    const ticket = {
      date: "2026-10-09",
      ticket_number: "sp-1048",
      supplier: "Test",
      product_code: "100M",
      sand_type_id: 1,
      pounds: 10000,
      silo_id: 1,
    };
    assert.equal((await post("deliveries", ticket)).status, 409);
    assert.equal(snapshot(db).deliveries.length, 2);
    const received = await post("deliveries", {
      ...ticket,
      confirm_duplicate: true,
    });
    assert.equal(received.status, 201);
    assert.equal(received.data.silos[0].on_hand, 162000);
    assert.equal(
      (
        await post("deliveries", {
          ...ticket,
          ticket_number: "NEW",
          pounds: 300000,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post("deliveries", {
          ...ticket,
          ticket_number: "NEW",
          sand_type_id: 2,
        })
      ).status,
      400,
    );
    const before = snapshot(db);
    const body = {
      well_id: 1,
      stage: 2,
      sand_type_id: 1,
      entries: [
        { silo_id: 2, pounds: 1000 },
        { silo_id: 3, pounds: 999999 },
      ],
    };
    assert.equal((await post("runs", body)).status, 400);
    assert.equal(snapshot(db).runs.length, before.runs.length);
    assert.equal(snapshot(db).silos[1].on_hand, before.silos[1].on_hand);
    const result = await post("runs", {
      ...body,
      entries: [{ silo_id: 2, pounds: 80000 }],
    });
    assert.equal(result.status, 201);
    assert.deepEqual(result.data.changes, [
      { silo_id: 2, before: 162000, after: 82000 },
    ]);
    assert.equal(result.data.pad.next.stage, 2);
    assert.equal(
      (
        await post("runs", {
          well_id: 1,
          stage: 2,
          sand_type_id: 2,
          entries: [{ silo_id: 12, pounds: 1000 }],
        })
      ).status,
      400,
    );
    const done = await post("runs", {
      well_id: 1,
      stage: 2,
      sand_type_id: 2,
      entries: [{ silo_id: 8, pounds: 60000 }],
    });
    assert.equal(done.data.pad.next.stage, 3);
    assert.equal(
      (await post("setup/silos", { ...snapshot(db).silos[1], sand_type_id: 2 }))
        .status,
      400,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  }
});
test("local SQLite survives closing and reopening without reseeding", () => {
  const dir = mkdtempSync(join(tmpdir(), "sand-pad-"));
  const file = join(dir, "pad.sqlite");
  let db = openStore(file);
  try {
    db.prepare(
      "INSERT INTO deliveries(pad_id,date,ticket_number,supplier,product_code,sand_type_id,pounds,silo_id) VALUES(1,'2026-10-09','PERSIST','Test','100M',1,1234,2)",
    ).run();
    db.prepare(
      "INSERT INTO customer_orders(pad_id,customer,strategy,silo_order) VALUES(1,'Northline Energy','custom','[3,1,2]')",
    ).run();
    const before = snapshot(db);
    db.close();
    db = openStore(file);
    assert.equal(snapshot(db).deliveries.length, 3);
    assert.equal(snapshot(db).silos[1].on_hand, before.silos[1].on_hand);
    assert.deepEqual(snapshot(db).customer_orders[0].silo_order, [3, 1, 2]);
    assert.equal(snapshot(db).next?.plans[0].pulls[0].silo_id, 3);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
