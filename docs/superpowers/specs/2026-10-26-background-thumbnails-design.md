# Thumbnails for every model, without opening it

**Status:** design agreed in conversation and reviewed; awaiting approval
**Date:** 2026-10-26

## Problem

In the Files app a 3D model looks like any other file. The app does have thumbnails, but a model only gets one after someone opens it in the viewer, and then only for that user:

- `ViewerComponent` and `ThreeViewer` capture the canvas after a model loads and POST it to `/api/thumbnail/{fileId}`. A folder of 50 STLs shows 50 identical icons until each is opened.
- `ThumbnailService` stores thumbnails in app data under `thumbnails/<userId>/`, and `ModelPreviewProvider::isAvailable()` answers only for the logged-in user's own thumbnail. Share recipients and public-link visitors see the plain icon even after the owner has opened the model.
- Only 12 formats are eligible (`glb gltf obj stl ply 3mf fbx dae 3ds x3d wrl vrml`), and the list is hard-coded three times: `ModelPreviewProvider`, `ThumbnailController::SUPPORTED_FORMATS`, and `captureThumbnail()` in both viewer components. STEP, IGES, BREP, FCSTD, IFC, 3DM, OFF, AMF, BIM and G-code never get one.
- The provider is registered for `/^model\/.*/` only. Formats whose MIME type is not `model/*` (IFC is `application/x-step`, FCSTD `application/x-fcstd`, G-code `text/x-gcode`, and FBX, 3DS and 3DM also map to `application/octet-stream`) never reach it.

### How Nextcloud caches previews (checked against server stable31, stable33 and master)

- The preview generator stores the first preview it produces per **file ID**, shared by every user who can read the file: app data `preview/<fileId>/` up to 32, a `previews` table from 33.
- That cache is cleared only by `OC\Preview\Watcher`, on a write to the file or a version rollback. There is no public API for an app to clear it.
- So if the app replaces a thumbnail for a file that hasn't changed, Nextcloud keeps serving the old one. This already happens: the viewer re-captures on every open, and Files keeps showing the first capture.

This design depends on that behaviour: **a thumbnail is written once per version of the file and never replaced.** An edit to the model clears Nextcloud's cache and makes the stored thumbnail obsolete in the same step, so the cache and the store can't disagree.

## Goals

- Models in Files show a picture of the model without anyone having to open them.
- A thumbnail made by one person is seen by everyone who can see the file, including share recipients and public-link visitors.
- Every format the viewer opens can get a thumbnail.
- Making thumbnails never makes Files feel slow and never costs more than the user's limits allow.
- An edited model gets a new thumbnail; an old one is never shown for a new version.

## Non-goals

- Server-side rendering. The server has no renderer. Thumbnails are made only in a browser that has a Nextcloud page open, and nothing happens once the tab is closed.
- A night-time or scheduled mode. Browsers throttle timers and pause rendering in hidden tabs, so a tab left open overnight would make almost no progress. Discussed and dropped.
- Thumbnailing a whole library from one place. Work happens for the folder being looked at.
- Choosing the camera angle, or replacing a thumbnail for an unchanged file.
- An admin-wide setting. Each user controls only their own browser's work. (My call; see below.)

## Anti-goals

These would make the feature a failure even if it worked:

- Files freezing or stuttering while thumbnails are made.
- A thumbnail that doesn't match the current version of the model.
- Someone who can only view a file changing the picture its owner and others see.
- Downloading gigabytes without the user having agreed to it. With default settings, a first visit to any folder downloads at most the folder-visit budget (500 MB).

## Decisions

| Question | Decision | Whose |
|---|---|---|
| Who makes thumbnails | The browser of whoever is viewing the folder in Files | Agreed |
| Is it optional | Yes, a per-user setting | User |
| Default | **On** for every user | User |
| Time limit per file | **30 seconds** by default, user-adjustable; on timeout the file is skipped | User |
| Size limit per file | Files above it are skipped without downloading; user-adjustable | User (the 50 MB default is my call) |
| Total download per folder visit | A budget, **500 MB** by default, user-adjustable; when spent, background work stops until the next visit | User chose a budget over per-file limits alone; the amount is my call |
| Which formats | Every format the viewer opens, CAD and BIM included, within the same limits | User |
| What happens to skipped files | They get a thumbnail the next time someone opens them in the viewer | User |
| Night schedule | Dropped | User |
| Storage | One thumbnail per file version, shared by everyone who can read the file | Agreed |
| Who may store one | Only users who can update the file | Agreed |
| Replacing a thumbnail | Never, for the same version | Agreed (forced by Nextcloud's cache) |

## How it behaves

### In Files

1. When the Files app shows a folder (an ordinary folder view, wherever it was reached from; not Recent, search results, or the app's own file browser, which can span a whole library — my call), the app's script (already loaded by `LoadFilesListener`) finds the model files in that folder that have no thumbnail for their current version.
2. It works through them **one at a time**, starting with rows on screen, and only when the browser is idle. It stops when the user leaves the folder and starts again for the next folder.
3. For each file it checks, before downloading anything: the size limit, the user's permission to update the file, and whether this browser already skipped this version. If any check fails, it moves on. It also checks the folder-visit budget: every byte downloaded for background thumbnails, companion files included, counts against it, and once the next file would exceed what is left, background work stops for this visit. Leaving the folder and coming back starts a fresh budget, and the files already done are not downloaded again. Files not reached are not marked skipped.
4. It loads and renders the model away from the page, frames it the way the viewer does on open, captures a 512×512 PNG and uploads it.
5. If rendering is not finished within the time limit, the work is stopped outright (not just ignored), the file is marked skipped for this version in this browser, and it moves on.
6. The finished thumbnail should replace the icon in the row without a page reload. If a supported Nextcloud version offers no clean way to do that, showing it on the next visit to the folder is acceptable on that version.

It pauses when the browser reports Save-Data or the tab is hidden. (My call.)

### In the viewer

Opening a model keeps capturing a thumbnail as today, under the existing "generate thumbnails" setting, but now:

- It stores only when the file has no thumbnail for its current version and the user can update the file.
- It covers every format, so this is where skipped files get their thumbnail.
- Because the viewer has no time or size limit, a file skipped in the background still gets a thumbnail here.

### Who sees what

- Anyone who can read the file sees its thumbnail in Files: the owner, share recipients and public-link visitors. Public links reach it through Nextcloud's own public preview route.
- A user who can only view a file never generates or uploads one for it. They see thumbnails made by people who can update it.
- Public-link visitors never store thumbnails, even on links that allow editing; the upload route stays session-only. This matches shared notes, where public links are view-only. (My call.)
- A user who turned background generation off still sees everyone else's thumbnails.

## Settings

The existing Thumbnails section in Personal settings (`src/views/PersonalSettings.vue`, stored in the `user_preferences` JSON via `SettingsController`) gains three fields next to the existing toggle:

| Setting | Default | Notes |
|---|---|---|
| Generate thumbnail when a model is opened (existing) | On | Unchanged meaning |
| Create thumbnails while browsing Files | **On** | Off stops all background work in this user's browsers |
| Skip files larger than | 50 MB | Checked before download |
| Give up on a file after | 30 seconds | The whole load and render, per file |
| Download at most, per folder visit | 500 MB | Total for background thumbnails, companions included |

The two toggles are independent. (My call.)

The existing "Clear thumbnails" button deleted the user's own thumbnails. Thumbnails are now shared, so one user clearing them would remove other people's. The button is replaced by **"Retry skipped files"**, which clears this browser's skip list. (My call.)

## Server

### Storage

Thumbnails move from `thumbnails/<userId>/<fileId>` to one per file: app data `thumbnails/<fileId>/<etag>.png`, or an equivalent keyed on file ID and the file's version. The builder may key on the ETag or on another value that changes whenever content changes and only then, but must state which.

- Writing a thumbnail for a version that already has one fails with 409. The first one stays.
- On `NodeWrittenEvent` the file's old thumbnails are deleted; on `NodeDeletedEvent` all of them. `FileIndexListener` already receives both events.
- Existing per-user thumbnails are not migrated, because there's no way to know which version they show. A repair step deletes `thumbnails/<userId>/`. (My call.) Models that already have a cached Nextcloud preview keep showing it until they are next edited, which is acceptable.

### Upload endpoint

`POST /api/thumbnail/{fileId}`, replacing the current behaviour:

- **CSRF required.** The current route has `#[NoCSRFRequired]`, so another site could forge a request in a logged-in user's browser and plant an image everyone would see. Remove the attribute; `@nextcloud/axios` already sends the request token.
- The caller must be able to **update** the file (`isUpdateable()`), not just read it.
- The request names the version it rendered (for example, the ETag the client saw). If that is no longer the file's current version, it is rejected, so a slow render of an old version can't land after an edit.
- The body must decode as a PNG or JPEG image (through `OCP\IImage` or equivalent) within the existing size cap. Today only the size is checked.
- The format check uses the shared format list (below), not its own array.

A cheap read endpoint, or a field the client can get with the folder listing, tells the client which files already have a thumbnail for their current version, so it doesn't download models that are already done. The builder chooses the mechanism; one request per model is not acceptable for large folders.

### Preview provider

- Register for every MIME type the app registers for a viewable format, not only `model/*`. `scripts/check-format-parity.mjs` should check this too.
- `isAvailable()` and `getThumbnail()` look up the thumbnail for the file's **current version**, with no dependence on the logged-in user, so cron, public links and other users all work.

### One format list

The thumbnail-eligible formats are "every format the viewer opens", taken from `lib/Constants/SupportedFormats.php` (minus companions such as `.mtl`) and `src/loaders/registry.js`. The four hard-coded copies are removed. The parity script fails CI if they drift.

## Rendering in the background

These are constraints the builder must meet. How to meet them is the builder's call.

- **Off the main thread, and stoppable.** Most loaders parse on the main thread, and OCCT and web-ifc parse synchronously inside WebAssembly. A 30-second limit is meaningless if the parse is blocking the page, and Files would freeze. Background rendering must run where it can be terminated at the limit and where it doesn't block the UI, such as a dedicated Worker with an `OffscreenCanvas`. Loaders that need the DOM (for example `TextureLoader`'s use of `Image`) need a worker-safe path or must be excluded from background generation and left to the viewer. The builder should list which formats end up in which group.
- **One fixed look, the same from both paths.** A shared thumbnail must not depend on whoever happened to make it. Every thumbnail, background or viewer, uses: a transparent background (so it reads on Files' light and dark themes), the default lighting preset, no wireframe, no custom palette, and the viewer's default camera fit on open. The viewer therefore no longer captures its live canvas, which carries that user's theme, palette, lighting and camera; it hands the loaded model to the same fixed-settings offscreen render the background path uses. (My call.) Reuse the viewer's camera-fit logic rather than writing a second one.
- **Multi-file models.** OBJ with MTL and textures, glTF with external buffers, and so on resolve their companion files the way the viewer does. The size limit applies to the main file; companions are fetched within the same time limit.
- **Memory.** Each render's geometry, textures, renderer and WebAssembly instance are released before the next starts. A folder of 200 files must not grow the tab's memory.
- **Concurrency.** Two people's browsers may render the same file at once. The first upload wins and the second gets a 409, which the client treats as done.

## Left to the builder

- How the script finds the folder being shown and its rows on Nextcloud 31–35 (event bus, the Files app's own APIs, or observing rendered rows), and how a finished thumbnail replaces the row's icon.
- The version key (ETag or equivalent) and the exact app-data layout.
- Where the per-browser skip list lives (IndexedDB or localStorage). It is keyed by file ID and version, and it is per browser on purpose: a file that times out on a slow laptop may succeed on a faster machine.
- The worker architecture, and which loaders run inside it.
- Unit, integration and Playwright test coverage, following the existing suites.

## My calls, for review

- 50 MB as the default size limit.
- 500 MB as the default folder-visit budget, and the budget resetting on each visit.
- Pausing on Save-Data and hidden tabs.
- No admin-wide setting.
- Independent toggles for "on open" and "while browsing".
- "Clear thumbnails" becomes "Retry skipped files".
- One fixed look for every thumbnail (transparent background, default lighting), which means the viewer renders its capture offscreen instead of grabbing its live canvas.
- Public-link visitors never store thumbnails.
- Only ordinary folder views in Files trigger background work.
- Existing per-user thumbnails are deleted rather than migrated.
