import { test, expect } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import type { Server } from "node:http";
import { openStore } from "../server/store";
import { createApp } from "../server/app";
let web: ViteDevServer, api: Server;
const db = openStore(":memory:");
test.beforeAll(async () => {
  api = createApp(db).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => api.once("listening", resolve));
  const a = api.address();
  if (!a || typeof a === "string") throw Error("API failed to start");
  web = await createServer({
    server: {
      port: 5180,
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
test("yard, tickets, partial runs, next stage, setup, print and mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5180");
  await expect(
    page.locator(".yard").getByRole("button", { name: /Silo \d/ }),
  ).toHaveCount(6);
  await expect(page.getByRole("heading", { name: "Silo 03" })).toBeVisible();
  await page.screenshot({ path: "qa/yard-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Tickets", exact: true }).click();
  await page.getByRole("button", { name: /Silo 3,/ }).click();
  await page.getByLabel("Supplier", { exact: true }).selectOption("__new");
  await page.getByLabel("New supplier", { exact: true }).fill("QA Sand");
  await page.getByLabel("Ticket number", { exact: true }).fill("SP-1048");
  await expect(
    page.getByText("This ticket number already exists."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save delivery" }),
  ).toBeDisabled();
  await page.getByLabel("Ticket number", { exact: true }).fill("QA-001");
  await page.getByLabel("Pounds", { exact: true }).fill("10000");
  await page.getByLabel("Product code", { exact: true }).fill("100M");
  await page.getByRole("button", { name: "Save delivery" }).click();
  await expect(page.getByRole("status")).toContainText("152,000");
  await expect(
    page.getByRole("cell", { name: "QA-001 QA Sand · 100 mesh" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stages", exact: true }).click();
  await expect(page.locator(".sheet-heading")).toContainText("Stage 2");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".yard")).toBeHidden();
  await expect(page.locator(".print-sheet")).toBeVisible();
  await page.screenshot({ path: "qa/pull-print.png", fullPage: true });
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "Stages", exact: true }).click();
  await page.getByRole("button", { name: "Record run", exact: true }).click();
  await page.getByRole("button", { name: /Silo 2,/ }).click();
  await page.getByLabel("Pounds from silo 2").fill("80000");
  await page.getByRole("button", { name: "Save run", exact: true }).click();
  await expect(page.locator(".run-result")).toContainText("162,000 → 82,000");
  await expect(page.getByLabel("Stage", { exact: true })).toHaveValue("2");
  await page.getByRole("button", { name: /Silo 5,/ }).click();
  await page.getByLabel("Pounds from silo 5").fill("60000");
  await page.getByRole("button", { name: "Save run", exact: true }).click();
  await expect(page.getByLabel("Stage", { exact: true })).toHaveValue("3");
  await expect(page.locator(".run-result")).toContainText("175,000 → 115,000");
  await page.getByRole("button", { name: "Setup", exact: true }).click();
  await page.getByLabel("Reorder reserve · stages").fill("20");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Job settings saved");
  await page.getByRole("button", { name: "Edit silo 3", exact: true }).click();
  await page.getByLabel("Manual order pin", { exact: true }).fill("1");
  await page
    .locator(".setup-form:not(.pad-tools-form)")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.locator(".setup-form:not(.pad-tools-form)")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit silo 2", exact: true }).click();
  await page.getByLabel("Manual order pin", { exact: true }).fill("1");
  await page
    .locator(".setup-form:not(.pad-tools-form)")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.locator(".setup-form:not(.pad-tools-form)")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Sand Pad yard", exact: true })
    .click();
  await page.getByRole("button", { name: /Silo 3,/ }).click();
  await expect(page.getByText(/Manual pin conflict/)).toBeVisible();
  await expect(page.getByText(/REORDER · below 20/)).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "qa/yard-mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Tickets", exact: true }).click();
  await expect(page.getByLabel("Supplier", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
