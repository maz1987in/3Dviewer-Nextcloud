# View in AR in the Light Viewer Implementation Plan

**Goal:** A public link to a model, and the Files preview, offer View in AR on a phone, with the full viewer's flow.

**Spec:** `docs/superpowers/specs/2026-11-13-ar-light-viewer-design.md`

**Architecture:** `ViewerComponent` uses `useViewInAR` and hands `runViewInAR` its own renderer, scene, camera, model and the file's unit. The button's words and the busy check move to `utils/viewInAr.js` so the panel and the light viewer share them. Nothing in `src/ar/` changes.

## Global Constraints

- Frontend only; no PHP. The public file-settings route already serves a share's unit.
- Every string through `t('threedviewer', …)`; the strings already exist in `l10n/en.json`.
- The embed page does not offer AR.
- Commits: conventional types, no Co-Authored-By. CHANGELOG under `[Unreleased]`, README Key Features bullet.

## Tasks

- [x] **1. Shared words.** `arButtonLabel`, `isArBusy` and `lightViewerOffersAr` in `utils/viewInAr.js`; `SlideOutToolPanel` uses the first two. Jest.
- [x] **2. Wire the light viewer.** `useViewInAR` in `setup()`, detect on mount (not in an embed), the button first in `.viewer-bottom-actions`, off with its reason for a scan or splat, two live lines for messages, `startViewInAR` waiting for the file's unit, `drawFrame` split out of `animate` for the session, the loop handed over and back, a session ended and a file dropped on a new file or on close.
- [x] **3. Playwright** (`tests/playwright/view-in-ar-light.spec.ts`): desktop, iPhone (USDZ at 10 mm, and 10 cm with a chosen unit), Android (session asked for, refusal said, retry), splat, embed.
- [x] **4. Real Nextcloud** (`tests/e2e-nextcloud/view-in-ar.spec.ts`): a visitor's Android and iPhone presses on a public link, under the CSP guard.
- [x] **5. Docs.** CHANGELOG, README, `docs/README.md`, `docs/TECHNICAL.md`, the View in AR spec's non-goal.
- [ ] **6. On a real Android phone and iPhone,** from a public link (see "Testing" in the spec).

## Review Focus

1. **The loop is handed back once.** `onEnd` restarts `animate` only if the renderer is still the one the session used, and cancels a pending frame first.
2. **Real size on a share.** The press waits for the unit request (`chosenUnitLoad`), so a unit chosen for the file applies for a visitor.
3. **Embeds stay as they were.** No detection runs there and the button is never drawn.
