import { resolve } from "node:path";
import express from "express";
import { openStore } from "./store";
import { createApp } from "./app";
const db = openStore(
  process.env.SAND_PAD_DB ?? resolve("data/sand-pad.sqlite"),
);
const app = createApp(db);
app.use(express.static(resolve("dist")));
app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
const server = app.listen(Number(process.env.PORT ?? 3001), "127.0.0.1", () =>
  console.log("Sand Pad API: http://127.0.0.1:3001"),
);
function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
