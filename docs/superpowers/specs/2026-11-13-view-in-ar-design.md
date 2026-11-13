# View in AR

**Status:** implemented; real-device checks listed below are still to do
**Date:** 2026-11-13

## Why

Someone who opens a chair, a part or a room model on their phone often wants to know one thing: how big is it, there, where I am. The viewer already knows the real size of a model (file units, "Measurements in Real Units") and can already write USDZ, but a phone user has no way to put the model in the room. "View in AR" does that.

## Goals

- A phone or tablet user presses one button and sees the open model in their room, at its real size, from the file's unit.
- The button is there only where it can work. A desktop never sees it.
- The existing VR button keeps working as it did.
- Opening a model is no slower, and the main bundle does not grow by more than the button itself: the Quick Look file, the WebXR session and every message load when the button is pressed.
- Every string goes through `t('threedviewer', …)`; every control works from the keyboard and is announced; the panel's mobile layout is unchanged.

## Non-goals

- Scene Viewer (Android's intent URL). See Decisions.
- Placing a model on a wall, anchoring it across sessions, shadows or light estimation, turning or resizing it in the room. A tap places it, a tap elsewhere moves it.
- AR in the light viewer of a public link (it has no tools panel) or in embeds. The button lives in the panel; a public link opened in the full viewer has it. (Since added to the light viewer, not to embeds: see [View in AR on public links](2026-11-13-ar-light-viewer-design.md).)
- Animated models: AR shows the pose the model is in.

## Design

### Which way a device has

`src/utils/viewInAr.js`, run once the renderer is ready (`detectArPath`):

1. `navigator.xr.isSessionSupported('immersive-ar')` is true: **WebXR** (Android Chrome and other WebXR browsers).
2. else `document.createElement('a').relList.supports('ar')`: **Quick Look** (Safari on iPhone and iPad, and Vision Pro).
3. else none: the button is not rendered.

WebXR is asked first, as model-viewer does. No browser in practice has both; if one did, a live session places the model on the floor, which Quick Look does only after its own scan.

### The button

In the tools panel's Export section, after "Record turntable": an icon (Material "augmented reality", added to `icon-paths.js` by `npm run icons:sync`) and the label "View in AR". It is a native `<button>`, so it is reachable and activated from the keyboard. While it works it is `aria-disabled` rather than `disabled` (a disabled button drops focus, as the panel's Export button already takes care of), `aria-busy`, and reads "Preparing AR…". If a file is ready but Safari no longer counts the tap (below) it reads "Open in AR".

It is in the panel, not the top bar: the bar is crowded on a phone, and the panel has the pattern for a control that is off with a reason (`tdv-unavailable-{key}`).

### Scans and splats

`'ar'` is added to `POINT_CLOUD_OFF` and `SPLAT_OFF` (`utils/offTools.js`) and to the lists of lines that say why (`pointclouds/unavailable.js`, `splats/unavailable.js`), which a test keeps in step. On a device with a way, the button stays in its place, `aria-disabled`, described by that line ("A splat has no real surface to stand in a room."). Pressing it does nothing. G-code, which is lines, is shown in a live session and turned down on Quick Look with "This model has no surfaces to show in AR."

### iPhone and iPad: AR Quick Look

1. `buildUsdz` (`utils/usdz.js`, the code the USDZ download already used, moved so both share it) writes the model under a scale of `millimetresPerUnit / 1000`, so one scene unit is the right number of metres. The USDZ exporter loads here.
2. The file is a `Blob` of type `model/vnd.usdz+zip`. A hidden `<a rel="ar" href="blob:…#allowsContentScaling=0">` holding an `<img>` is clicked. Safari opens Quick Look for such a link. `allowsContentScaling=0` stops Quick Look from letting the person pinch the model to another size.
3. The viewer's render mode and exploded view are set aside for the write, as an export does, so AR shows the model's own materials, parts together.
4. Safari opens Quick Look only soon after a tap. Writing a big model can outlast that. If `navigator.userActivation.isActive` is false once the file is ready, the file is kept and the button changes to "Open in AR"; the next tap opens it. The file is dropped when the model changes, and revoked a minute after it is opened.

### Android Chrome: WebXR `immersive-ar`

`src/ar/session.js`:

- `requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay'], domOverlay })`. The reference space is `local`; a hit-test source is made from the `viewer` space.
- The overlay is a small element of the page's own: a line saying what to do (in a live region), and an "Exit AR" button of at least 44 px. `beforexrselect` is cancelled on it so a tap on a button is not a tap on the floor. Without `dom-overlay` the browser's own exit gesture works.
- A white ring is drawn on the floor where the hit-test lands. A tap puts the model there: its bottom centre on the ring, turned about the upright so its front (+Z) faces the person, at `millimetresPerUnit / 1000` metres a unit. A tap elsewhere moves it.
- The model is not moved out of the scene. The *scene* is scaled to metres and moved to the spot, which leaves the model, and every tool that holds it, where they were; they are put back at the session's end. Everything else in the scene (grid, axes, lights, markers, gizmos) is hidden for the session, the background and fog are removed so the camera shows, and the model is lit by lights of the session's own (the viewer's directional light would point at the wrong place once the scene is moved).
- Render mode and exploded view are set aside for the session, as for the file, and come back when it ends. The viewer's animation loop hands over to the session's and takes over again on `end`.
- Starting a session needs a tap. The code behind the button loads when it is pressed, which in practice is well within the browser's window for a tap; a browser that says no anyway is reported as "AR could not start. Check that this site may use the camera…".

### Size

AR needs the model on a phone, so the model is checked first (`ar/limits.js`, by triangle count):

| Way | Warns past | Turned down past |
|---|---|---|
| Quick Look | 250,000 | 1,000,000 |
| WebXR | 1,000,000 | 3,000,000 |

Quick Look is the stricter because three writes USDZ geometry as text: a million triangles is a file of well over 100 MB made inside the page. WebXR writes nothing and only draws. The numbers are judgement, not measurement; they are one constant each to change. A warning is a toast, as export's is. A turned-down model gets an error toast naming the count and the limit. A write that runs out of memory anyway ends in "The model could not be shown in AR. It may be too large for this device." and leaves the button usable.

## Decisions

- **Panel, not top bar.** Reason above.
- **Scene Viewer, rejected.** Scene Viewer (`intent://arvr.google.com/scene-viewer/…`) takes a *public https URL* to a GLB and fetches it itself, with no cookies. That works for a public share of a file and for nothing else: a logged-in user's file is behind their session. Every Android device that can run Scene Viewer also has ARCore, and so has WebXR in Chrome, so Scene Viewer would add no devices; it would add a second path that works only sometimes. Not built.
- **No Quick Look on Android, no WebXR on iOS.** iOS has no WebXR `immersive-ar` in Safari; Android has no Quick Look. Each device has at most one way.
- **A GLB blob is not made for WebXR.** The live model is drawn; nothing is exported.
- **Scale the scene, not the model.** Reparenting or scaling the model would have to be undone in every place a tool kept a copy of its transform (the gizmo's reset, the exploded view's origins). The scene has none of those.
- **Real size comes from `modelMillimetresPerUnit`**, the figure Print check, 3MF and the USDZ download already use, so a unit the editor chose for the file applies.
- **Triangle limits by count, not bytes.** A count is cheap and known (`getGeometryStats`); bytes of a file not yet written are not. Textures are not counted; a phone-hostile texture set is not caught.

## Bundle

`useViewInAR` (state, detection) and the button stay in the App chunk. `ar/flow.js` (the choice, the guard, the words), `ar/quickLook.js`, `ar/session.js` and `ar/limits.js` are dynamic imports; the USDZ exporter already was. The App chunk grows by about 3.2 KB raw (1 KB gzip), mostly the button, the help entry, the icon and the detection, against a 2.2 KB headroom, so its raw budget is raised from 397 KB to 399 KB with a note in `scripts/check-bundle-size.mjs`.

## Testing

- Jest: detection (every combination, errors), scale from units, limits, the Quick Look flow (file made once, ready state, failure recovery, set-aside and restore), the WebXR session against a stand-in session (request, hiding and restoring, placement at real size and its bottom on the floor, moving, ring true to the floor after the scene is scaled, Exit, end reported once), the real USDZ exporter's output read back for its extent, off-tool lists.
- Playwright, Chromium with `relList.supports('ar')` and `navigator.xr` stubbed: hidden on a desktop; on "iPhone" a real USDZ blob reaches an `<a rel="ar">` with an `<img>`, in metres, 10 mm for an STL cube and 2 m for a glTF; on "Android" the session is asked for with `hit-test` and the overlay, a refusal is reported and leaves nothing over the page; WebXR wins when both are there; a splat has the button off with its reason.
- **Needs a real iPhone and a real Android phone** (nothing here opens Quick Look or runs a camera session): that Quick Look opens from the blob link and shows the right size; that a long write falls back to "Open in AR"; that the ring finds the floor, a tap places the model at the right size and facing the person, a second tap moves it, Exit AR returns to the viewer undamaged, and a second session works.
