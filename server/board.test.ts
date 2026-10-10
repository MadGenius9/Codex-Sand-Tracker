import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore, snapshot } from "./store";
import { createApp } from "./app";
test("board selectors and mesh colors persist, validate, copy per pad and preserve ledger", async () => {
  const dir = mkdtempSync(join(tmpdir(), "python-board-")),
    file = join(dir, "pad.sqlite");
  let db = openStore(file);
  const server = createApp(db).listen(0, "127.0.0.1");
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
    const ledger = snapshot(db).ledger;
    let r = await send(
      "settings",
      {
        job_names: ["Job A", "Job B"],
        job_name: "Job A",
        shift_names: ["Day", "Night"],
      },
      "PUT",
    );
    assert.equal(r.status, 200);
    assert.equal(r.data.pad.active_shift, "Day");
    r = await send(
      "settings",
      { job_name: "Job B", active_shift: "Night" },
      "PUT",
    );
    assert.equal(r.status, 200);
    assert.equal(r.data.pad.job_name, "Job B");
    r = await send("settings", { active_shift: "Fake shift" }, "PUT");
    assert.equal(r.status, 400);
    assert.equal(snapshot(db).pad.active_shift, "Night");
    r = await send("settings", { job_name: "Unknown job" }, "PUT");
    assert.equal(r.status, 400);
    r = await send("setup/sand_types", {
      ...snapshot(db).sand_types[0],
      color: "#22aacc",
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.sand_types[0].color, "#22aacc");
    r = await send("setup/sand_types", {
      ...snapshot(db).sand_types[0],
      color: "blue",
    });
    assert.equal(r.status, 400);
    r = await send("pads", { name: "Board clone", copy_setup: true });
    assert.equal(r.status, 201);
    assert.deepEqual(r.data.pad.job_names, ["Job A", "Job B"]);
    assert.equal(r.data.pad.active_shift, "Night");
    assert.equal(r.data.sand_types[0].color, "#22aacc");
    assert.equal(r.data.ledger.runs.length, 0);
    assert.deepEqual(snapshot(db).ledger, ledger);
    await new Promise<void>((r) => server.close(() => r()));
    db.close();
    db = openStore(file);
    assert.equal(snapshot(db).pad.job_name, "Job B");
    assert.equal(snapshot(db).pad.active_shift, "Night");
    assert.equal(snapshot(db).sand_types[0].color, "#22aacc");
    assert.deepEqual(snapshot(db).ledger, ledger);
    assert.deepEqual(db.pragma("foreign_key_check"), []);
  } finally {
    if (server.listening)
      await new Promise<void>((r) => server.close(() => r()));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
