import { test, expect } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import type { Server } from "node:http";
import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../server/store";
import { createApp } from "../server/app";
let web: ViteDevServer, api: Server;
const db = openStore(":memory:");
const artifacts =
  process.env.SAND_PAD_QA_DIR ?? join(tmpdir(), "sand-pad-browser");
test.beforeAll(async () => {
  mkdirSync(artifacts, { recursive: true });
  api = createApp(db).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => api.once("listening", resolve));
  const a = api.address();
  if (!a || typeof a === "string") throw Error("API failed to start");
  web = await createServer({
    server: {
      port: 5181,
      strictPort: true,
      host: "127.0.0.1",
      proxy: { "/api": `http://127.0.0.1:${a.port}` },
    },
  });
  await web.listen();
});
test.afterAll(async () => {
  await web?.close();
  await new Promise<void>((resolve) => api?.close(() => resolve()));
  db.close();
});
test("edits and voids update yard; log, pads, stage history, mappings and download", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${m.text()} (${m.location().url})`);
  });
  await page.goto("http://127.0.0.1:5181/");
  await expect(page).toHaveTitle("Sand Pad");
  await expect(page.getByRole("button", { name: /Silo \d/ })).toHaveCount(6);
  await page.screenshot({
    path: join(artifacts, "sand-pad-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Setup", exact: true }).click();
  await page.getByLabel("Mapped product code", { exact: true }).fill("4070");
  await page
    .getByLabel("Mapped mesh", { exact: true })
    .selectOption({ label: "40/70" });
  await page.getByRole("button", { name: "Save mapping", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("mapping saved");
  await page.getByRole("button", { name: "Tickets", exact: true }).click();
  await page.getByLabel("Supplier", { exact: true }).selectOption("Atlas Sand");
  await page.getByLabel("Product code", { exact: true }).fill("4070");
  await expect(page.getByLabel("Mesh", { exact: true })).toHaveValue("2");
  await expect(
    page.getByRole("button", { name: "Save delivery" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /Silo 5,/ }).click();
  await page.getByLabel("Ticket number", { exact: true }).fill("LEDGER-001");
  await page.getByLabel("Pounds", { exact: true }).fill("5000");
  await page.getByRole("button", { name: "Save delivery" }).click();
  await expect(page.getByRole("status")).toContainText("180,000");
  await page.getByRole("button", { name: "Log", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit ticket LEDGER-001", exact: true })
    .click();
  await page.getByLabel("Pounds", { exact: true }).fill("3000");
  await page.getByLabel("Date", { exact: true }).fill("2026-10-08");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("edited");
  await page
    .getByRole("button", { name: "Sand Pad yard", exact: true })
    .click();
  await page.getByRole("button", { name: /Silo 5,/ }).click();
  await expect(page.locator(".readings").first()).toContainText("178,000");
  await page.getByRole("button", { name: "Log", exact: true }).click();
  await page.getByLabel("From date").fill("2026-10-08");
  await page.getByLabel("Through date").fill("2026-10-08");
  await expect(
    page.getByRole("button", { name: "Edit ticket LEDGER-001" }),
  ).toBeVisible();
  await page.getByLabel("From date").fill("");
  await page.getByLabel("Through date").fill("");
  await page.getByRole("button", { name: "Edit ticket LEDGER-001" }).click();
  await page.getByRole("button", { name: "Void record", exact: true }).click();
  await page.getByRole("button", { name: "Confirm void", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("voided");
  await expect(
    page.getByRole("row").filter({ hasText: "LEDGER-001" }),
  ).toContainText("Voided");
  await page
    .getByRole("button", { name: "Sand Pad yard", exact: true })
    .click();
  await expect(page.locator(".readings").first()).toContainText("175,000");
  await page.getByRole("button", { name: "Record run", exact: true }).click();
  await page.getByRole("button", { name: /Silo 2,/ }).click();
  await page.getByLabel("Pounds from silo 2").fill("40000");
  await page.getByRole("button", { name: "Save run", exact: true }).click();
  await expect(page.locator(".run-result")).toContainText("122,000");
  await page.getByRole("button", { name: "Log", exact: true }).click();
  await page.getByRole("button", { name: "Edit run 3", exact: true }).click();
  await page.getByLabel("Pounds", { exact: true }).fill("20000");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("edited");
  await expect(
    page
      .locator(".setup-section")
      .getByRole("row")
      .filter({ hasText: "Stage 2" })
      .filter({ hasText: "100 mesh" }),
  ).toContainText("20,000");
  await expect(
    page
      .locator(".setup-section")
      .getByRole("row")
      .filter({ hasText: "Stage 2" })
      .filter({ hasText: "100 mesh" }),
  ).toContainText("Short");
  await page
    .getByRole("button", { name: "Sand Pad yard", exact: true })
    .click();
  await expect(page.locator(".readings").first()).toContainText("142,000");
  await page.getByRole("button", { name: "Log", exact: true }).click();
  await page.getByRole("button", { name: "Edit run 3", exact: true }).click();
  await page.getByRole("button", { name: "Void record", exact: true }).click();
  await page.getByRole("button", { name: "Confirm void", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("voided");
  await page.screenshot({
    path: join(artifacts, "sand-pad-log.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Sand Pad yard", exact: true })
    .click();
  await expect(page.locator(".readings").first()).toContainText("162,000");
  await page.getByRole("button", { name: "Setup", exact: true }).click();
  await page
    .locator(".pad-tools-form")
    .filter({
      has: page.getByRole("button", { name: "Create pad", exact: true }),
    })
    .getByLabel("Pad name", { exact: true })
    .fill("Night pad 2");
  await page.getByRole("button", { name: "Create pad", exact: true }).click();
  await expect(page.getByLabel("Active pad")).toHaveValue("2");
  await page
    .getByRole("button", { name: "Sand Pad yard", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Silo 1,.*0 pounds/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Log", exact: true }).click();
  await expect(page.getByText("No records in this date range.")).toBeVisible();
  await page.getByLabel("Active pad").selectOption("1");
  await expect(
    page.getByRole("row").filter({ hasText: "LEDGER-001" }),
  ).toContainText("Voided");
  await page.getByRole("button", { name: "Tickets", exact: true }).click();
  await page.getByLabel("Supplier", { exact: true }).selectOption("Atlas Sand");
  await page.getByLabel("Product code", { exact: true }).fill("4070");
  await expect(page.getByLabel("Mesh", { exact: true })).toHaveValue("2");
  await page.getByLabel("Active pad").selectOption("2");
  await page.getByLabel("Supplier", { exact: true }).selectOption("__new");
  await page.getByLabel("New supplier", { exact: true }).fill("Other supplier");
  await page.getByLabel("Ticket number", { exact: true }).fill("SP-1048");
  await page.getByLabel("Pounds", { exact: true }).fill("10000");
  await page.getByRole("button", { name: "Save delivery" }).click();
  await expect(page.getByRole("status")).toContainText("10,000");
  await page.getByRole("button", { name: "Setup", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download SQLite", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("sand-pad.sqlite");
  const file = await download.path();
  expect(readFileSync(file!).subarray(0, 16).toString()).toBe(
    "SQLite format 3\0",
  );
  await page.getByLabel("Active pad").selectOption("1");
  await page
    .getByRole("button", { name: "Sand Pad yard", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: join(artifacts, "sand-pad-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Log", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("Setup holds a real job and settings drive ticket and run screens", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const response = await page.request.post(
    "http://127.0.0.1:5181/api/pads?pad_id=1",
    { data: { name: "Setup QA job", copy_setup: true } },
  );
  expect(response.status()).toBe(201);
  const created = await response.json();
  await page.goto("http://127.0.0.1:5181/?pad_id=" + created.pad.id);
  await page.getByRole("button", { name: "Setup", exact: true }).click();
  const identity = page.locator(".settings-form");
  await identity.getByLabel("Pad name", { exact: true }).fill("Real Night Job");
  await identity.getByLabel("Customer", { exact: true }).fill("Real Customer");
  await identity.getByLabel("Pounds per ton").fill("2200");
  await identity.getByLabel("Pounds per truckload").fill("58000");
  await identity.getByLabel("Draw strategy").selectOption("fullest");
  await identity.getByLabel("Include toe stage").check();
  await identity.getByLabel("Clear manual silo pins").check();
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Job settings saved");
  const firstWell = created.wells[0];
  await page
    .getByRole("button", { name: "Edit " + firstWell.name, exact: true })
    .click();
  const editor = page.locator(".entity-form");
  await editor.getByLabel("Planned stages", { exact: true }).fill("2");
  await editor.getByLabel("100 mesh", { exact: true }).fill("1000");
  await editor.getByLabel("40/70", { exact: true }).fill("0");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page
    .getByRole("button", { name: "Edit 100 mesh", exact: true })
    .click();
  await editor
    .getByLabel("Whole-job design · lb", { exact: true })
    .fill("4000000");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ hasText: "Pumped / planned" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit silo 3", exact: true }).click();
  await editor.getByLabel("Name", { exact: true }).fill("Toe supply");
  await editor
    .getByLabel("Starting balance · lb", { exact: true })
    .fill("10000");
  await editor.getByLabel("Manual order pin", { exact: true }).fill("1");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.screenshot({
    path: join(artifacts, "sand-pad-job-setup.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Pull sheet", exact: true }).click();
  await expect(page.locator(".sheet-heading")).toContainText("Toe stage");
  await expect(page.locator(".mesh-sheet").first()).toContainText(
    "Design 1,000 lb",
  );
  await page.getByRole("button", { name: "Record run", exact: true }).click();
  await expect(page.getByLabel("Stage", { exact: true })).toHaveValue("0");
  await page.getByRole("button", { name: /Silo 3,/ }).click();
  await page.getByLabel("Pounds from silo 3", { exact: true }).fill("1000");
  await page.getByRole("button", { name: "Save run", exact: true }).click();
  await expect(page.getByLabel("Stage", { exact: true })).toHaveValue("1");
  await expect(page.locator(".run-result")).toContainText("10,000 → 9,000");
  await page.getByRole("button", { name: "Setup", exact: true }).click();
  page.once("dialog", async (d) => {
    expect(d.message()).toContain("ledger rows will be retained");
    await d.accept();
  });
  await page
    .getByRole("button", { name: "Remove silo 3", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit silo 3", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Log", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "Toe stage" }),
  ).toHaveCount(3);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Setup", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: join(artifacts, "sand-pad-job-mobile.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("customer order settings update yard and follow the chosen run well", async ({
  page,
}) => {
  const response = await page.request.post(
    "http://127.0.0.1:5181/api/pads?pad_id=1",
    { data: { name: "Customer order QA", copy_setup: true } },
  );
  expect(response.status()).toBe(201);
  const p = await response.json();
  await page.goto("http://127.0.0.1:5181/?pad_id=" + p.pad.id);
  await page.getByRole("button", { name: "Setup", exact: true }).click();
  await page
    .getByLabel("Order customer", { exact: true })
    .fill("Northline Energy");
  await page
    .getByLabel("Customer draw strategy", { exact: true })
    .selectOption("custom");
  await page.getByLabel("Silo order", { exact: true }).fill("3, 1, 2, 5, 4, 6");
  await page
    .getByRole("button", { name: "Save customer order", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Customer pull order saved",
  );
  await page
    .getByRole("button", { name: "Sand Pad yard", exact: true })
    .click();
  await page.getByRole("button", { name: /Silo 3,/ }).click();
  await expect(
    page.locator(".readings").nth(1).locator("dd").first(),
  ).toHaveText("1");
  await expect(page.getByText(/Northline Energy customer order/)).toBeVisible();
  await page.getByRole("button", { name: "Setup", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit " + p.wells[1].name, exact: true })
    .click();
  await page
    .locator(".entity-form")
    .getByLabel("Customer", { exact: true })
    .fill("Customer B");
  await page
    .locator(".entity-form")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.locator(".entity-form")).toHaveCount(0);
  await page.getByLabel("Order customer", { exact: true }).fill("Customer B");
  await page
    .getByLabel("Customer draw strategy", { exact: true })
    .selectOption("fullest");
  await page
    .getByRole("button", { name: "Save customer order", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Customer pull order saved",
  );
  await page.getByRole("button", { name: "Record run", exact: true }).click();
  await page.getByLabel("Well").selectOption(String(p.wells[1].id));
  await expect(page.getByText(/Customer B customer order/)).toBeVisible();
  await expect(page.locator(".next-stage")).toContainText(p.wells[1].name);
  await page.getByRole("button", { name: "Pull sheet", exact: true }).click();
  await expect(page.locator(".print-sheet")).toContainText(
    "Northline Energy customer order",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Setup", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
