# Print Check Open Without Freezing: Implementation Plan

**Goal:** Print check's card appears at once on large models, and nothing it does holds the page.

**Spec:** `docs/superpowers/specs/2026-11-13-print-check-open-design.md`.

**Architecture:**
- `src/printCheck/surfaceMeasures.js` (plain module): `measuredObjects`, `surfacePart` (the copy for the worker), `extentAlong`, `overhangAreas`, `volumeAndArea`, `measureSurface`.
- `src/printCheck/printCheck.worker.js`: `load`, `measure` and `closed` on the held model, beside `thickness`.
- `src/printCheck/printCheckClient.js`: `openSurfaceSession(parts)` → `{ measure, checkClosed, close }`; `checkClosed(parts)` is gone.
- `src/printCheck/surfaceOverlay.js`: overlays can be held out of sight; `compileQuietly` compiles without stalling.
- `src/printCheck/overhang.js`: `uFlat` and `createFlatMaterial`.
- `src/composables/usePrintCheck.js`: asynchronous `recompute`, stored measurement, persistent box and bed, `measureFailed`; takes `renderer`.

## Tasks

- [x] Measure first: Node timings of each per-triangle function; Playwright with long tasks, frame gaps, card time and CPU profiles on 240k and 1M triangles (numbers in the spec and PR).
- [x] `surfaceMeasures.js` and Jest equality tests against the three.js functions.
- [x] Worker session and client; client tests.
- [x] Composable: open, recompute, showFit, applyMeasurement, estimate, teardown; tests for the new behaviour.
- [x] Shaders: hold and compile; one shared shader for box, bed and shading; tests.
- [x] Card: "Measuring…" and "Could not measure the model"; `l10n/en.json`.
- [x] Playwright: responsiveness on 240k triangles, closing mid-measurement, #263 workaround removed; `--repeat-each 5` for the cancel tests.
- [x] CHANGELOG `[Unreleased]` › Fixed, `docs/TECHNICAL.md` Print Check.
