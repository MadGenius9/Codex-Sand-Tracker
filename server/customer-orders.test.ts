import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore, snapshot } from "./store";
import { createApp } from "./app";
test("customer orders select by well, preview safely, honor pins/offline, validate and remain isolated by pad", async () => {
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
    const before = snapshot(db);
    let r = await send("customer-orders", {
      customer: "Northline Energy",
      strategy: "custom",
      silo_order: [3, 1, 2, 5, 4, 6],
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.next.plans[0].pulls[0].silo_id, 3);
    assert.equal(r.data.next.plans[1].pulls[0].silo_id, 8);
    assert.equal(r.data.draw_order.source, "customer");
    assert.deepEqual(snapshot(db).ledger, before.ledger);
    r = await send("customer-orders", {
      customer: "northline energy",
      strategy: "custom",
      silo_order: [3, 3],
    });
    assert.equal(r.status, 400);
    assert.equal(snapshot(db).customer_orders.length, 1);
    r = await send("customer-orders", {
      customer: "Northline Energy",
      strategy: "custom",
      silo_order: [99],
    });
    assert.equal(r.status, 400);
    r = await send("customer-orders", {
      customer: "Other Customer",
      strategy: "fullest",
    });
    assert.equal(r.status, 200);
    r = await send("setup/wells", {
      ...before.wells[1],
      customer: "Other Customer",
    });
    assert.equal(r.status, 200);
    r = await send("pull-plan", { well_id: 2, stage: 1 });
    assert.equal(r.status, 200);
    assert.equal(r.data.draw_order.customer, "Other Customer");
    assert.equal(r.data.next.plans[0].pulls[0].silo_id, 2);
    assert.equal(snapshot(db).next!.well.id, 1);
    assert.equal(
      snapshot(db).draw_order.customer.toLowerCase(),
      "northline energy",
    );
    r = await send("pull-plan", { well_id: 2, stage: 999 });
    assert.equal(r.status, 400);
    r = await send("setup/silos", { ...before.silos[0], manual_pin: 1 });
    assert.equal(r.status, 200);
    assert.equal(r.data.next.plans[0].pulls[0].silo_id, 1);
    r = await send("setup/silos", { ...before.silos[0], offline: 1 });
    assert.equal(r.status, 200);
    assert.equal(r.data.next.plans[0].pulls[0].silo_id, 3);
    assert.equal(r.data.silos[0].run_order, null);
    const copy = await send("pads", {
      name: "Copy customer job",
      copy_setup: true,
    });
    assert.equal(copy.status, 201);
    assert.equal(copy.data.customer_orders.length, 2);
    assert.deepEqual(
      copy.data.customer_orders[0].silo_order,
      snapshot(db).customer_orders[0].silo_order,
    );
    const order = snapshot(db).customer_orders.find(
      (o) => o.customer.toLowerCase() === "northline energy",
    )!;
    r = await send(
      "customer-orders/" + order.id,
      {},
      "DELETE",
      copy.data.pad.id,
    );
    assert.equal(r.status, 404);
    assert.equal(snapshot(db).customer_orders.length, 2);
    r = await send("customer-orders/" + order.id, {}, "DELETE");
    assert.equal(r.status, 200);
    assert.equal(r.data.draw_order.source, "pad");
    assert.equal(r.data.draw_order.strategy, "sequential");
    r = await send("settings", { customer: "Other Customer" }, "PUT");
    assert.equal(r.status, 200);
    r = await send("setup/wells", { ...snapshot(db).wells[0], customer: "" });
    assert.equal(r.status, 200);
    assert.equal(r.data.draw_order.customer, "Other Customer");
    assert.equal(r.data.draw_order.strategy, "fullest");
    assert.deepEqual(db.pragma("foreign_key_check"), []);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    db.close();
  }
});
