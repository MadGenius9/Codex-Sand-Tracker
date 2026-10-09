# Verification

The yard concept is `yard-concept.png`. The rendered primary screen is `yard-preview.png`. Both were directly inspected with the image viewer at the concept's 1536 × 1024 desktop viewport. Mobile was checked at 390 × 844 with no horizontal overflow.

The in-app browser failed to initialize twice. Playwright was used as the fallback; downloaded Chromium failed to spawn on this host, so the successful browser run used installed Edge through Playwright's Chromium driver.

| Comparison             | Implementation and result                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Layout                 | Two six-tank sides, open yard at left, one right rail, fine divider. Desktop sizing was tightened to fit the reference viewport.              |
| Typography             | IBM Plex Sans and Mono bundled locally; deliberate heading, navigation, reading, and form sizes.                                              |
| Palette                | #0e1013 background, steel-gray surfaces, #c4a36a sand, bone selection, restrained low/offline text.                                           |
| Tanks                  | Cylinders, steel cones, braced legs, ladders, guardrails and level markings. The cone was corrected to remain steel rather than sand colored. |
| Selection and readings | Bone-selected tank and matching rail. A numeric offline flag initially rendered a stray zero; fixed by an explicit Boolean condition.         |
| Navigation copy        | Sand Pad, Tickets, Pull sheet, Record run, Setup match the requested labels. No logo or extra navigation.                                     |
| Responsive behavior    | At phone width, each side wraps into two lines of three tanks, and the rail follows the yard; fields remain usable.                           |
| Print                  | Only the stage sheet is visible under print media; page background is white.                                                                  |

Intentional differences from generated sample data: real demo balances and orders replace invented concept values; Side B is correctly 40/70. Footer shows online totals for both meshes and the actual next stage instead of the concept's unrelated average-fill metric. Detailed code-native SVG tanks replace photographic concept tanks so clipping and fill can animate from ledger values. On mobile the six-tank rows wrap for readable selection targets. These changes preserve the user's operational and visual requirements.

The implementation was visually verified against the concept for its yard layout, palette, typography families, tank anatomy and selection. It deliberately uses a technical schematic treatment rather than claiming photographic asset fidelity. No remaining functional or layout defects were found in the checked workflows.

Validation: TypeScript + Vite production build; three ledger/API/persistence tests; one end-to-end browser workflow spanning all five screens. Browser checks include duplicate pre-save warning, receiving and immediate balance updates, mesh-complete stage advancement, before/after run values, reserve edits, manual pin conflict, print isolation, mobile overflow and absence of page errors. Browser tests use a separate in-memory SQLite database.
