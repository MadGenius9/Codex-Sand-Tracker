import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore, snapshot } from "./store";
import { createApp } from "./app";
test("real job settings, toe/overrides, completed-stage options, suppliers, removal and cloned-pad isolation", async () => {
  const db = openStore(":memory:"),
    server = createApp(db).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const a = server.address() as { port: number };
  const send = async (
    path: string,
    body: unknown,
    method = "POST",
    pad = 1,
  ) => {
    const r = await fetch(
      "http://127.0.0.1:" + a.port + "/api/" + path + "?pad_id=" + pad,
      {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    return { status: r.status, data: await r.json() };
  };
  try {
    let p = snapshot(db);
    assert.equal(p.settings.pounds_per_ton, 2000);
    assert.equal(p.settings.pounds_per_truckload, 57000);
    let r = await send(
      "settings",
      {
        name: "Real Job",
        customer: "Customer A",
        pounds_per_ton: 2200,
        pounds_per_truckload: 58000,
        reserve: 6,
        strategy: "partials",
        toe_stage: 1,
        clear_pins: 1,
      },
      "PUT",
    );
    assert.equal(r.status, 200);
    assert.equal(r.data.next.stage, 0);
    r = await send("setup/wells", {
      ...p.wells[0],
      toe_stage: 1,
      overrides: [
        { sand_type_id: 1, pounds: 1000 },
        { sand_type_id: 2, pounds: 0 },
      ],
    });
    assert.equal(r.status, 200);
    p = r.data;
    assert.equal(p.next!.plans[0].required, 1000);
    assert.equal(p.next!.plans[1].required, 0);
    assert.equal(p.job_design[0].planned, 41 * 1000 + 41 * 80000);
    r = await send("setup/sand_types", {
      ...p.sand_types[0],
      job_total: 4000000,
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.job_design[0].job_total, 4000000);
    assert.equal(r.data.job_design[0].pumped, 80000);
    r = await send("setup/silos", {
      ...p.silos[1],
      name: "North tank",
      manual_pin: 1,
    });
    assert.equal(r.status, 200);
    r = await send("runs", {
      date: "2026-10-09",
      well_id: 1,
      stage: 0,
      sand_type_id: 1,
      entries: [{ silo_id: 2, pounds: 400 }],
    });
    assert.equal(r.status, 201);
    assert.equal(r.data.pad.next.stage, 0);
    assert.equal(r.data.pad.silos[1].manual_pin, 1);
    r = await send("runs", {
      date: "2026-10-09",
      well_id: 1,
      stage: 0,
      sand_type_id: 1,
      entries: [{ silo_id: 2, pounds: 600 }],
    });
    assert.equal(r.status, 201);
    assert.equal(r.data.pad.next.stage, 2);
    assert.equal(r.data.pad.silos[1].manual_pin, null);
    assert.equal(
      r.data.pad.stage_history.find((s: any) => s.stage === 0).short,
      false,
    );
    r = await send(
      "settings",
      { auto_advance: 0, current_well_id: 1, current_stage: 2 },
      "PUT",
    );
    assert.equal(r.status, 200);
    r = await send("runs", {
      date: "2026-10-09",
      well_id: 1,
      stage: 2,
      sand_type_id: 1,
      entries: [{ silo_id: 2, pounds: 1000 }],
    });
    assert.equal(r.status, 201);
    assert.equal(r.data.pad.next.stage, 2);
    assert.equal(r.data.pad.next.plans[0].remaining, 0);
    r = await send("suppliers", { name: "Mine Hauling" });
    assert.equal(r.status, 201);
    r = await send("deliveries", {
      date: "2026-10-09",
      ticket_number: "NEW-1",
      supplier: "New Supplier",
      product_code: "MINE100",
      sand_type_id: 1,
      silo_id: 2,
      pounds: 2000,
      remember_product: true,
    });
    assert.equal(r.status, 201);
    assert.ok(r.data.suppliers.some((s: any) => s.name === "New Supplier"));
    r = await send("product-map", { product_code: "mine100", sand_type_id: 1 });
    assert.equal(r.status, 200);
    assert.equal(
      r.data.product_map.filter(
        (m: any) => m.product_code.toLowerCase() === "mine100",
      ).length,
      1,
    );
    const before = snapshot(db),
      ledgerCount = before.ledger.runs.length;
    r = await send("setup/silos/2", {}, "DELETE");
    assert.equal(r.status, 409);
    r = await send("setup/silos/2", { confirm_history: true }, "DELETE");
    assert.equal(r.status, 200);
    assert.equal(r.data.silos.length, 5);
    assert.equal(r.data.all_silos.length, 6);
    assert.equal(r.data.ledger.runs.length, ledgerCount);
    assert.equal(r.data.all_silos[1].name, "North tank");
    r = await send("setup/wells/1", {}, "DELETE");
    assert.equal(r.status, 409);
    r = await send("setup/wells/1", { confirm_history: true }, "DELETE");
    assert.equal(r.status, 200);
    assert.equal(r.data.all_wells.length, 2);
    assert.equal(r.data.stage_history.length, 3);
    r = await send("pads", { name: "Job Two", copy_setup: true });
    assert.equal(r.status, 201);
    assert.equal(r.data.settings.pounds_per_ton, 2200);
    assert.equal(r.data.pad.customer, "Customer A");
    assert.equal(r.data.ledger.runs.length, 0);
    assert.equal(r.data.suppliers.length, 3);
    assert.equal(r.data.product_map.length, 1);
    assert.equal(r.data.silos.length, 5);
    assert.ok(r.data.silos.every((s: any) => s.on_hand === 0));
    assert.equal(snapshot(db).ledger.runs.length, ledgerCount);
    assert.deepEqual(db.pragma("foreign_key_check"), []);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    db.close();
  }
});
test("all six draw strategies honor pins and exclude offline/removed tanks", () => {
  const db = openStore(":memory:");
  try {
    const order = () =>
      snapshot(db)
        .silos.filter(
          (s) => s.sand_type_id === 1 && !s.offline && !s.deleted_at,
        )
        .sort((a, b) => a.run_order! - b.run_order!)
        .map((s) => s.number);
    const choose = (s: string) =>
      db.prepare("UPDATE settings SET strategy=?").run(s);
    choose("sequential");
    assert.deepEqual(order(), [2, 3, 1]);
    choose("emptiest");
    assert.deepEqual(order(), [3, 1, 2]);
    choose("fullest");
    assert.deepEqual(order(), [2, 1, 3]);
    choose("least_used");
    assert.deepEqual(order(), [2, 3, 1]);
    db.prepare("UPDATE silos SET starting_balance=250000 WHERE id=2").run();
    choose("partials");
    assert.deepEqual(order(), [3, 1, 2]);
    choose("pairs");
    assert.deepEqual(order(), [2, 1, 3]);
    db.prepare("UPDATE silos SET manual_pin=1 WHERE id=3").run();
    assert.equal(order()[0], 3);
    db.prepare("UPDATE silos SET offline=1 WHERE id=3").run();
    assert.ok(!order().includes(3));
  } finally {
    db.close();
  }
});
test("six active silos is enforced per pad; retiring one frees a slot without deleting history", async () => {
  const db = openStore(":memory:"),
    server = createApp(db).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const a = server.address() as { port: number };
  const send = async (path: string, body: unknown, method = "POST") => {
    const r = await fetch("http://127.0.0.1:" + a.port + "/api/" + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: r.status, data: await r.json() };
  };
  try {
    const { id, ...silo } = snapshot(db).silos[0];
    const candidate = { ...silo, number: 99, starting_balance: 0 };
    let r = await send("setup/silos", candidate);
    assert.equal(r.status, 400);
    assert.match(r.data.error, /at most 6/);
    assert.equal(snapshot(db).silos.length, 6);
    r = await send("setup/silos", { ...silo, id, name: "Edited at limit" });
    assert.equal(r.status, 200);
    const before = snapshot(db);
    r = await send("setup/silos/" + id, { confirm_history: true }, "DELETE");
    assert.equal(r.status, 200);
    assert.equal(r.data.silos.length, 5);
    assert.equal(
      r.data.ledger.deliveries.length,
      before.ledger.deliveries.length,
    );
    r = await send("setup/silos", candidate);
    assert.equal(r.status, 200);
    assert.equal(r.data.silos.length, 6);
    assert.equal(r.data.all_silos.length, 7);
    r = await send("setup/silos", { ...candidate, number: 100 });
    assert.equal(r.status, 400);
    assert.deepEqual(db.pragma("foreign_key_check"), []);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    db.close();
  }
});
test("reducing the original sample retires excess tanks and preserves ledger; configured pads are untouched", async () => {
  const { reduceOriginalDemo } = await import("./demo");
  const db = openStore(":memory:");
  try {
    db.prepare("UPDATE silos SET number=id WHERE id IN (7,8,12)").run();
    const balances = [
      184000, 162000, 142000, 118000, 80000, 24000, 196000, 175000, 153000,
      132000, 104000, 52000,
    ];
    for (const id of [4, 5, 6, 9, 10, 11])
      db.prepare(
        "INSERT INTO silos(id,pad_id,number,side,sand_type_id,capacity,starting_balance,offline) VALUES(?,1,?,?,?,250000,?,0)",
      ).run(id, id, id <= 6 ? "A" : "B", id <= 6 ? 1 : 2, balances[id - 1]);
    const before = snapshot(db);
    db.prepare("UPDATE pads SET name='Configured job' WHERE id=1").run();
    reduceOriginalDemo(db);
    assert.equal(snapshot(db).silos.length, 12);
    db.prepare("UPDATE pads SET name='Demo pad' WHERE id=1").run();
    reduceOriginalDemo(db);
    const after = snapshot(db);
    assert.equal(after.silos.length, 6);
    assert.equal(after.all_silos.length, 12);
    assert.deepEqual(after.ledger, before.ledger);
    for (const s of after.silos)
      assert.equal(s.on_hand, before.silos.find((b) => b.id === s.id)!.on_hand);
    reduceOriginalDemo(db);
    assert.equal(snapshot(db).silos.length, 6);
    assert.deepEqual(db.pragma("foreign_key_check"), []);
  } finally {
    db.close();
  }
});
