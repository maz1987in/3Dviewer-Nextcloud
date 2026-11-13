# View in AR on Public Links and in the Light Viewer

**Status:** implemented; real-device checks listed below are still to do
**Date:** 2026-11-13
**Builds on:** [View in AR](2026-11-13-view-in-ar-design.md)

## Why

View in AR shipped in 3.11.0 in the full viewer's tools panel only. A public link to one model (`/s/{token}`) opens the light viewer (`src/views/ViewerComponent.vue`), and so does the Files app's preview. That is how a model reaches a client or a friend, often on their phone, which is when "how big is it, here" matters most. The light viewer had Screenshot, Model info and Copy link, and no AR.

## Goals

- The light viewer offers View in AR wherever the full viewer would: a phone or tablet with a way (Quick Look or WebXR), for a model with a surface.
- The same flow, the same limits and the same `[ar]` log lines as the full viewer. No AR logic is copied.
- The model is its real size there too, from the file's unit, including a unit chosen for the file, which a visitor reads through the share's own settings route.
- Password-protected and expired shares behave exactly as before.

## Non-goals

- AR in a frame on another site (the embed page). See Decisions.
- Resizing the light viewer when a phone turns. It never did; AR does not change that.

## Design

### The button

In `.viewer-bottom-actions`, first, before Screenshot. It is a pill with the AR icon and its words ("View in AR", "Preparing AR…", "Open in AR"), where the buttons beside it are round icons with a label for screen readers. Two reasons: on a phone it is the button a visitor came for, and "Open in AR" (Safari's second tap, below) only works if it can be read. The words come from `arButtonLabel` in `utils/viewInAr.js`, which the tools panel now uses too.

It is shown when `lightViewerOffersAr(path, { embedded })` is true: the device has a way (`useViewInAR().detect()`, run on mount) and the viewer is not the embed page. The bottom actions themselves appear only once the model has loaded, so a share behind a password, or one that has expired, never reaches it.

While it works the button is `aria-disabled` and `aria-busy`, as in the panel, so focus stays on it; a press then does nothing (`isArBusy`).

### Scans and splats

`offToolsFor` (`utils/offTools.js`) on the loaded model's `userData` says AR is off. The button stays, `aria-disabled`, described by the same line the panel uses (`pointclouds/unavailable.js`, `splats/unavailable.js`, loaded only for a scan or splat). A tap shows that line on the page, because a phone shows no description on a tap.

### Saying what happens

No toast reaches a share page: `push-toast` goes nowhere there. The light viewer shows the flow's `notify` messages itself, above its buttons, in two lines that are always in the page: a `role="status"` line for information and warnings, and a `role="alert"` line for errors. A message clears after 6 s (10 s for an error) and on the next press.

### Wiring to the light viewer

`ViewerComponent` calls `useViewInAR()` in `setup()` and passes `runViewInAR` (through `viewInAR.start`) its own pieces:

- `object`: the loaded model (`linkModel`, the object the camera was fitted to).
- `millimetresPerUnit`: `millimetresPerUnit(effectiveFilename, model, chosenUnit)` from `utils/sourceUnits.js`, the function the full viewer uses. `chosenUnit` comes from the file's settings, through the public route (`PublicFileSettingsController`) on a share. The press waits for that request if it is still out, so the size is never the format's default by accident; a second tap meanwhile is ignored.
- `triangles`: the Faces count Model info already shows.
- `hold`: none. The light viewer has no shading modes or exploded view to set aside.
- `xr`: the viewer's renderer (with `xr.enabled` turned on at the press; drawing outside a session is unchanged by it), scene and camera; `renderFrame` draws one frame without the orbit controls (`drawFrame({ controls: false })`, split out of `animate`); `onEnd` restarts the page's own loop, unless the viewer has since moved to another file or closed. When a session starts, the page's `requestAnimationFrame` loop is cancelled, as in the full viewer.

Moving to another file in the Files viewer ends a running session and drops a file waiting for a tap; closing the viewer does the same (`viewInAR.dispose()`).

A WebXR session needs no transparent canvas: three.js clears to transparent in an `alpha-blend` session whatever the canvas was created with, and the session draws into its own layer.

## Decisions

- **Not in embeds.** A WebXR session inside a frame needs the frame to allow `xr-spatial-tracking`. Only the site that frames the model can grant that, and every embed already copied lacks it. Adding `allow="xr-spatial-tracking"` to the copied code would help only new embeds, and on iOS Quick Look from inside a cross-origin frame is not dependable and cannot be tested here. The embed page keeps its few buttons (full screen, download, "Open in Nextcloud"); its link leads to the share page, which offers AR. Rejected for now: adding the `allow` attribute to "Copy embed code".
- **In the Files preview too.** It is the same component, and a logged-in user on a phone gains the same thing. Nothing about it is share-specific.
- **A pill, not an icon.** Reason above. The other buttons stay as they were.
- **Messages on the page, not toasts.** A toast system would be new to the light viewer for one feature; two live lines are enough and work on a share page and in the Files viewer alike.
- **The triangle count from Model info,** not `getGeometryStats` from `useExport.js`, which would pull the USDZ writer's module into the light viewer's chunk. Both count the same way.

## Bundle

The light viewer's chunk gains the button, the messages and the wiring. `useViewInAR` and `utils/viewInAr.js` now sit in a small chunk shared by the full and the light viewer, so the App chunk is about 2.2 KB smaller and the entry carries one more preload entry (+69 B raw, within its budget). `ar/flow.js` and the rest still load on the first press.

## Testing

- Jest (`tests/unit/utils/viewInAr.test.js`): the button's words by state, when a press is ignored, and when the light viewer offers AR (a way, no way, an unknown way, in a frame).
- Playwright, static harness (`tests/playwright/view-in-ar-light.spec.ts`), a visitor on a public link with `relList.supports('ar')` or `navigator.xr` stubbed: no button on a desktop; on "iPhone" a real USDZ reaches an `<a rel="ar">` with an `<img>`, 10 mm for an STL cube, and 10 cm when the file's unit, read through the share, is centimetres; on "Android" `immersive-ar` is asked for with `hit-test` and the overlay, a refusal is said in the alert line, nothing is left over the page and a second press asks again; a splat has the button off with its reason, said on a press; the embed page has no button even with both ways stubbed.
- Real Nextcloud (`tests/e2e-nextcloud/view-in-ar.spec.ts`), a visitor on a public link with no session: on "Android" the button asks for a session with `hit-test`; on "iPhone" a USDZ blob is made and handed to the link. Both run under the suite's guard, which fails on a Content-Security-Policy violation or a missing app file, so the chunks the press loads are proven to load on a real share page.
- **Needs a real phone:** on Android Chrome, from a public link: the ring finds the floor, a tap places the model at the right size, Exit AR returns to the viewer drawing and orbiting as before, and a second session works. On an iPhone, from a public link: Quick Look opens at the right size.
