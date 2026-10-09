# Sand Pad

A local frac-sand pad tracker. The yard is the primary surface: select a steel silo to inspect its balance or work with tickets and stage pulls.

## Run

Requires Node.js 22.12+ (Node.js 24 recommended).

```sh
npm ci
npm run dev
```

Open http://localhost:5173. One command runs Vite and the Express API at `127.0.0.1:3001`. The first API startup creates `data/sand-pad.sqlite` with a demo pad: 12 silos, two sides, two meshes, two wells, two tickets and two runs. Subsequent starts preserve the ledger. No external credentials or services are required. IBM Plex fonts are bundled locally.

```sh
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm start
```

The production server serves the built client and API at http://127.0.0.1:3001. `SAND_PAD_DB` optionally sets a different SQLite file; `PORT` changes the API port (update the Vite proxy if using a different development API port). Back up the database using SQLite's backup tooling, or stop the app before copying the database and its WAL files. Local databases, dependencies, and builds are excluded from Git.

## Operations

- **Pad:** two yard rows. Hover or keyboard-focus a silo to read pounds and stages; click for its rail. Low means less than one stage in that tank. Offline stock is shown but excluded from stage planning and reorder coverage.
- **Tickets:** click a receiving silo, enter its delivery, save. Mesh follows the silo assignment. Duplicate ticket numbers are checked case-insensitively; explicit confirmation is required before a duplicate save. Product code is optional. Capacity overflow is rejected.
- **Pull sheet:** the next unfinished well/stage, with each mesh's remaining design pounds allocated in draw order. Print prints the sheet alone. Shortfalls are visible rather than silently reducing the required stage pounds.
- **Record run:** select a mesh and click one or more online tanks. Adjust pounds per tank and save the entire pull atomically. Before/after balances remain visible. A stage advances only when **all configured meshes** meet their design pounds for that well/stage. Partial runs count toward completion; additional runs and corrected stage/well selections are permitted, but inventory cannot go below zero.
- **Setup:** add or edit wells, meshes and silos, adjust the reserve (default five stages), offline status and optional pins. A silo with ledger history cannot change mesh. Starting-balance changes affect the computed balance and are validated against capacity. There is no ledger deletion UI.

## Inventory and draw rules

On-hand is always `starting_balance + SUM(deliveries) - SUM(runs)`. It is computed, never persisted as an authoritative field. Tank fill and silo stages use this balance. Mesh reorder coverage uses online pounds divided by design pounds per stage; offline inventory is excluded from available coverage.

Sequential rotation begins after the most recently used silo of that mesh and wraps by silo number. Manual pins draw first in ascending pin order; unpinned tanks follow the rotation. Conflicting pins on online tanks of the same mesh are flagged in the rail; the rotation supplies a deterministic tie-break. Allocation spans additional tanks when necessary. Each API save returns a fresh computed pad snapshot, so the React app updates without a reload.

The local Express API is the only data connection from React. SQLite uses foreign keys, WAL journaling and transactions. The five domain tables are `wells`, `sand_types`, `silos`, `deliveries`, and `runs`; a small `settings` table persists reserve and strategy. This version models one pad per database file. No Firebase, Firestore, Google GenAI, AI Studio applet configuration, or ticket scanner is included. The server binds to loopback for local use.

Tests cover ledger arithmetic, rotation/pins, offline reserve, partial and complete stages, duplicate tickets, over-capacity deliveries, atomic overdraw rejection, mesh assignment, and persistence across a database restart.

The browser test starts its own temporary API with an in-memory database, so it does not modify the local demo ledger. Set `PLAYWRIGHT_CHANNEL=msedge` to use installed Edge instead of downloaded Chromium. Screenshots and test outputs go to the ignored `qa/` directory.

![Sand Pad yard](docs/yard-preview.png)
