# Version comparison, print check, wall thickness and turntable video

**Status:** design agreed in conversation; awaiting approval
**Date:** 2026-10-28

## Why

People open models in this app for different reasons: some only look, some take notes, some check a part before sending it to a 3D printer. The app should cover what an everyday user needs so nobody has to switch to another application. Heavy enterprise work, such as formal version management, approvals or product lifecycle tools, is out of scope.

This design adds four tools:

1. **Version comparison:** compare a model with an earlier Nextcloud version of the same file.
2. **Print check:** build volume, overhangs, a filament estimate, and the slicer's own numbers for G-code files.
3. **Wall thickness check:** show walls too thin to print.
4. **Turntable video:** record the model spinning, to send to someone who won't open a viewer.

## Goals

- Each tool is invisible to people who don't need it. It sits in the tools panel, is off until opened, and needs no setup.
- Nothing new is downloaded or computed until someone uses the tool. Opening a model is no slower than in 3.8.1.
- Lengths use the model's real unit, the same one the measurement tool already uses (`VIEWER_CONFIG.measurement.unitScales`, `useMeasurement`). A file with no unit counts as millimetres, as slicers do, and the screen says so.
- Every new control works from the keyboard and is announced to screen readers, to the standard the tools panel reached in 3.8.1 (#234).
- Every string goes through `t('threedviewer', …)`.
- Nextcloud 31–35, the range the app supports today.

## Non-goals

- Slicing, generating supports, and print-time estimates for models that haven't been sliced. A real slicer is a separate program; the existing "send to slicer" button covers it.
- Naming, approving, restoring or branching versions. Nextcloud's own version sidebar does that.
- Colouring exactly which surfaces changed between two versions (a geometric diff). It may come later.
- Fixing thin walls, or turning the model to a better print orientation.
- GIF output, or camera paths beyond one full turn.

## Anti-goals

- The viewer starting to feel like a CAD program or a slicer.
- Any of these tools slowing down opening a model for people who never use them.
- A tool's overlay ending up in an export or a thumbnail. Overhang shading, thickness colours, the build-volume box and the version ghost are viewing aids only. Thumbnails already ignore viewer state (3.8.1), and that must stay true.

## 1. Version comparison

### Behaviour

- The existing Compare tool (`useComparison`) gains a second way to choose the other model. Next to picking a file, there's **"An earlier version of this file"**.
- It lists the versions Nextcloud keeps for the open file, newest first. Each shows its date, size, and author and label when Nextcloud has them.
- Choosing one loads that version as the comparison model. The side-by-side layout and the table of differences work as they do today, labelled **"This version"** and the version's date.
- **New: overlay.** A switch places both models at the same position, with the earlier version drawn as a see-through ghost (one flat colour, about 35% opacity, no textures), so moved or resized parts stand out. Side by side stays the default.
- **Overlay alignment:** both versions are placed by the file's own coordinates, with the same offset, scale and unit applied to both: whatever the viewer does to centre the current version, it does identically to the earlier one. They are *not* aligned by their bounding boxes, because adding or removing one feature changes the box and would shift the whole ghost, hiding the change it should show.
- **Multi-file models** (OBJ with MTL and textures, glTF with .bin, and so on): the earlier version of the main file is loaded with today's supporting files, because Nextcloud versions each file separately. A one-line note under the version list says so.

### Who sees it

- Logged-in users who can read the file. It must work for share recipients as well as the owner, wherever Nextcloud lets them see versions.
- **Not on public share links.** Nextcloud doesn't show versions to people without an account, and neither does this.
- If the Versions app is disabled, or the file has no earlier versions, the choice is hidden or says "No earlier versions". It is never an error.

### Server and permissions

- Versions come from Nextcloud's own versions API (`files_versions`, the `versions` WebDAV collection), so its permission checks apply unchanged. The app must not add a route that hands out version content without those checks. If the builder needs a server endpoint, for example to reuse `ModelDependencyResolver`, it checks access the same way the file endpoint does today and has CSRF protection on any write (#235).

## 2. Print check

A **Print check** section in the tools panel, off until opened. Opening it places the model on a printer bed. It works on the main model only and turns off while Compare is on.

### Build volume

- A see-through box the size of the chosen printer's build volume, with the model resting on the bed at its centre.
- **Which way is up:** the model as the user currently sees it, including any turning or scaling done with the move/rotate tool (`useTransformGizmo`). Fit, bed contact and overhangs follow those changes. Exploded view and clipping are viewing aids and are ignored: the check uses the assembled, unclipped model.
- **"Up: Y / Z" switch:** STL, 3MF, PLY and DAE are already turned upright on load, but other formats (OBJ, STEP, FBX and so on) are shown with the file's own Y as up, so a file authored Z-up lies on its side. One switch in Print check stands it upright by treating the file's Z as up. It defaults to how the viewer shows the model and is remembered per file for the session. This is a one-click correction, not automatic orientation.
- **Printer choice:** a short list of common printers plus **Custom** (width, depth, height). The list holds about ten current models from Prusa, Bambu Lab, Creality, Anycubic and Elegoo, with sizes checked against each maker's published specs.
- The choice is remembered per user in the viewer's existing preferences (`/apps/threedviewer/settings`, `SettingsController`, the `user_preferences` blob merged into `VIEWER_CONFIG`), under a `printCheck` key. On public share links it's remembered in that browser only.
- If the model doesn't fit, the box turns red and a line says by how much it sticks out on each axis, for example "12.4 mm too wide".

### Overhangs

- Surfaces facing downward more steeply than the overhang angle are shaded red. The angle is measured from vertical: 0° is a vertical wall and 90° a flat ceiling. The default is 45°, with a slider from 20° to 80°.
- Surfaces resting on the bed don't count.
- A line shows the share of the surface area that is overhang.

### Whether the model is closed

- `useModelStats` skips the watertight test above `WATERTIGHT_MAX_TRIANGLES` (500,000) or on non-indexed meshes, and reports `null`. When Print check opens, it runs the test itself for any part whose result is `null`, off the main thread, with no triangle cap. Until the test finishes, the estimate shows "Checking…". This adds no cost to opening a model.
- A model is closed only if every part is closed.

### Filament estimate

- Shown only for closed models. If any part is open, it says "Needs a closed model: N parts have holes" and gives no estimate, because the volume of an open mesh isn't meaningful.
- Inputs: infill percentage (default 20%) and material (PLA by default; also PETG, ABS, ASA, TPU, each with a standard density). Filament diameter is 1.75 mm.
- One simple formula, documented in `docs/TECHNICAL.md`. Walls and top/bottom count as solid to a fixed shell depth, and the inside counts at the infill percentage. Output is grams and metres of filament, labelled **"estimate"**.

### G-code files

- For G-code files, the section shows the numbers the slicer wrote into the file instead of the build volume, overhangs and estimate. Those are print time, filament length, filament weight and, when present, the slicer's name.
- It reads the comment formats written by PrusaSlicer, SuperSlicer, OrcaSlicer, Bambu Studio and Cura. Some slicers write these at the end of the file, so it reads both the beginning and the end.
- Fields that aren't found are left out. If none are found, it says "This file doesn't include the slicer's estimates".

## 3. Wall thickness check

- A **Check wall thickness** button inside the Print check section. It runs only when pressed.
- **Minimum thickness:** 0.8 mm by default (two lines from a 0.4 mm nozzle), and you can change it. It is in the model's real unit.
- **Result colours:** red is thinner than the minimum, and yellow is between the minimum and 1.5× the minimum. Everything else keeps its normal look.
- A legend, a line giving the share of surface area that is too thin, and hovering a spot shows its thickness.
- **Method:** from points spread across the surface, measure along the inward normal to the opposite wall. The result only means something for a closed model, so it uses the same closed-model test as Print check (run on demand, no cap). If any part is open, the result carries a warning saying so.
- **Performance:**
  - It runs off the main thread, so the viewer stays usable while it works.
  - It shows progress, and there's a Cancel button.
  - Above a point budget it samples the surface instead of checking every point, and the result says so.
  - Rough target: a 1-million-triangle model finishes in under about 15 seconds on a typical laptop.
- **Library:** `three-mesh-bvh` (MIT). It's loaded only when the button is pressed, in its own chunk, so normal viewing doesn't download it.
- **Not offered** for G-code, point clouds, or models with no triangle meshes. The button is hidden for those.
- Turning the check off, closing the model or changing models restores the normal materials.

## 4. Turntable video

- A **Record turntable** button next to Screenshot in the tools panel.
- **What it records:** one full turn of the camera around the model's centre on the up axis, starting from the current view and zoom. It records what's on screen: render mode, wireframe, lighting, background, and annotations and print-check colours if they're showing.
- **Settings:**
  - length: 4–15 s, default 8 s;
  - size: 720p, 1080p or the window's size;
  - direction: clockwise or counter-clockwise;
  - frame rate: 30 fps.
- **While recording:** a progress bar and a Stop button. Camera controls and the other tools are locked until it finishes, and Stop keeps what was recorded so far.
- **Format:** WebM in browsers that can record it (Chrome, Firefox, Edge). MP4 in Safari, which can't. The file extension matches what was made.
- **Saving:**
  - It downloads by default, named `<model name>-turntable.<ext>`.
  - If the user can create files in the model's folder, a **"Save next to the model"** option writes it there instead, through Nextcloud's normal file write path. A name that's taken gets " (2)", " (3)" and so on.
  - On public share links, only download is offered.

## Testing

- Jest for the pure logic:
  - parsing the versions response;
  - classifying overhang faces;
  - the filament formula;
  - unit conversion for the build volume and thickness;
  - G-code comment parsing, with real header and footer samples from each slicer named above;
  - the "doesn't fit" message.
- Playwright for each tool's main path in the dev container:
  - pick an earlier version and switch to overlay;
  - open Print check and change printer and angle;
  - run the thickness check on a small fixture and cancel one on a large one;
  - record a short turntable and check a file comes out.
- A test that exports and thumbnails made while each overlay is on don't contain it.

## Left to the builder

- How the version content is loaded: straight from WebDAV in the browser, or through an app endpoint. Either way, Nextcloud's permission checks apply.
- How the ghost, the overhang shading and the thickness colours are drawn (material swap, vertex colours, a second pass), as long as the originals are restored exactly.
- The exact shell depth in the filament formula, the point budget for thickness sampling, and the material densities.
- The exact printer list, within "about ten current models from those five makers".
- How the video is rendered at a size other than the window's.
- Where each control sits inside its section.

## My calls, for review

- All four ship together in one minor release; you choose the number.
- The version ghost is one flat colour at about 35% opacity, and side by side stays the default.
- The overlay aligns the two versions by the file's coordinates, not their bounding boxes.
- Print check runs the closed-model test itself, without the 500,000-triangle cap; any open part means no filament estimate.
- Print check turns off while Compare is on.
- Print check ignores exploded view and clipping, and the "Up: Y / Z" choice lasts for the session, not saved.
- PLA is the default material and 20% the default infill; the filament is 1.75 mm.
- The overhang slider runs from 20° to 80°.
- The 0.8 mm default minimum, and yellow up to 1.5× the minimum.
- The turntable records at 30 fps, defaults to 8 seconds and caps at 15.
- "Save next to the model" is offered only to people who can create files in that folder.
