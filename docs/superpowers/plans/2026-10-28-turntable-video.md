# Turntable Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record a short video of the camera making one full turn around the model, to download or save next to the model in Nextcloud.

**Architecture:**
- **Recording:** the viewer's own render loop pauses (`renderPaused`), and a recording loop takes over. Each frame it places the camera on the orbit and renders once, then hands that frame to a `canvas.captureStream(0)` track with `requestFrame()`. `MediaRecorder` encodes the frames.
- **Output size:** the renderer is resized for the chosen size, and every setting it changes is restored afterwards, whether recording finished, stopped or failed.
- **Saving:** the video goes to the user's folder through WebDAV, checked with the folder's `oc:permissions`.

**Tech Stack:** Vue 3, three.js r186, MediaRecorder / `HTMLCanvasElement.captureStream`, `@nextcloud/axios`, `@nextcloud/router`, `@nextcloud/auth`, Jest (jsdom), Playwright (Chromium).

**Spec:** `docs/superpowers/specs/2026-10-28-viewer-tools-design.md` (section "4. Turntable video", plus Goals and Non-goals)

## Global Constraints

- **Nextcloud versions:** 31–35. `appinfo/info.xml` keeps `<nextcloud min-version="31" max-version="35"/>`.
- **Strings:** every string goes through `t('threedviewer', …)`. After adding strings, run `npm run i18n:sync`; then `npm run i18n:check` must report no ERROR.
- **Accessibility:**
  - every new control is a native `button`, `input` or `select` with a name;
  - progress sits in an `aria-live="polite"` region;
  - the dialog traps focus the way the existing dialogs do (`useFocusTrap`).
- **Loading:** nothing new loads until it's used. The dialog is a `defineAsyncComponent`.
- **Bundle budgets:** `npm run build` passes `size:check` with every existing budget unchanged.
- **What the video shows:** exactly what is on screen. That includes the render mode, wireframe, lighting, background, and the in-scene annotations, measurements and print-check colours. Face labels are page text drawn over the canvas (`CSS2DRenderer` in `useFaceLabels.js`), so they aren't in the video; `docs/TECHNICAL.md` says so.
- **Frames:**
  - 30 fps;
  - length 4–15 s, 8 s by default;
  - sizes `'720p'` (1280 × 720), `'1080p'` (1920 × 1080) and `'window'` (the canvas's current drawing-buffer size);
  - direction `'cw'` or `'ccw'`.
- **Saving:**
  - "Save next to the model" is offered only to a logged-in user whose folder permissions include `C`;
  - public share links get the download only.
- **Commits:**
  - conventional types, with the scope `turntable`;
  - **no `Co-Authored-By` trailer**;
  - don't push, and don't open a PR.
- **CHANGELOG:** entries go under `## [Unreleased]` → `### Added`.
- **Nextcloud containers:** never bind-mount the repo or a worktree into one; copy files in with `docker cp`.
- **Before each commit:** run `npm run lint`, `npm run stylelint`, and the task's tests.

## Review Focus

1. **A browser without `MediaRecorder` or `captureStream`** (an older Safari, or a locked-down browser): the button is disabled, and its tooltip says `"This browser can't record video"`. (Task 1: `pickRecordingFormat returns null when nothing is supported`; Task 4: component test.)
2. **The tab is hidden mid-recording**, which throttles timers: recording stops, the part recorded so far is kept, and the dialog says why. (Task 3: `hiding the page stops and keeps the recording`.)
3. **An error mid-recording** (the GPU context is lost, or a render throws): the renderer size, pixel ratio, camera aspect and position, control state and `renderPaused` are all back as they were. (Task 3: `a render error restores everything`.)
4. **The name is taken twice already:** with `model-turntable.webm` and `model-turntable (2).webm` in the folder, the next save is `model-turntable (3).webm`. (Task 1 test.)
5. **The folder is read-only** (shared without create permission): there's no save option, and the download still works. (Task 2: `no C in permissions means no create`.)

---

### Task 1: Pure turntable helpers

**Files:**
- Create: `src/utils/turntable.js`
- Test: `tests/unit/utils/turntable.test.js`

**Interfaces:**
- `TURNTABLE_DEFAULTS = Object.freeze({ seconds: 8, size: '720p', direction: 'cw', fps: 30 })`, `TURNTABLE_SECONDS = { min: 4, max: 15 }`.
- `pickRecordingFormat(isTypeSupported: (type) => boolean): ?{ mimeType: string, extension: 'webm'|'mp4' }`. It tries these in order: `video/webm;codecs=vp9`, `video/webm;codecs=vp8`, `video/webm`, `video/mp4;codecs=avc1`, `video/mp4`.
- `frameCount(seconds, fps = 30): number`. This is `Math.round(seconds × fps)`.
- `orbitPosition(start: Vector3, target: Vector3, up: Vector3, fraction: number, direction: 'cw'|'ccw'): Vector3`. It turns `start` about the axis through `target` along `up` by `2π × fraction`. `'cw'` is clockwise as seen from above, which is a negative angle about `up`.
- `outputSize(size: '720p'|'1080p'|'window', canvas: { width, height }): { width, height }`. Both sides are rounded to even numbers, because encoders need that.
- `turntableFileName(modelName: string, extension: string, existingNames: string[]): string`. The result is `<model name without extension>-turntable.<ext>`, then ` (2)`, ` (3)` and so on, compared case-insensitively.

- [ ] **Step 1: Write the failing tests**:
  - `prefers VP9 WebM`
  - `falls back to MP4 when WebM is unsupported (Safari)`
  - `pickRecordingFormat returns null when nothing is supported`
  - `8 s at 30 fps is 240 frames`
  - `fraction 0 and 1 return the start position; 0.25 cw from +Z, about +Y, gives +X`
  - `distance to the target and height along up stay constant`
  - `odd window sizes round to even`
  - `name collisions count up to (3)`
- [ ] **Step 2:** Run `npx jest tests/unit/utils/turntable.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(turntable): orbit, format and file-name helpers`

### Task 2: Folder permissions and saving through WebDAV

**Files:**
- Create: `src/utils/davFiles.js`
- Test: `tests/unit/utils/davFiles.test.js`

**Interfaces:**
- `userFilesUrl(userId: string, path: string): string`. This is `generateRemoteUrl('dav') + '/files/' + encodeURIComponent(userId)` plus the path, with each segment encoded.
- `canCreateIn(userId, dirPath): Promise<boolean>`. It sends a PROPFIND with Depth 0 for `oc:permissions`, and is `true` only when the value contains `C`. It is `false` on any error.
- `listNames(userId, dirPath): Promise<string[]>`. It sends a PROPFIND with Depth 1 and returns the entries' display names.
- `putFile(userId, dirPath, name, blob): Promise<void>`. It sends a PUT with the blob's type as `Content-Type`, and rejects on a non-2xx status.

- [ ] **Step 1: Write the failing tests**, with axios mocked:
  - `permissions with C mean create`
  - `no C in permissions means no create`
  - `an error means no create`
  - `listNames reads the display names`
  - `putFile encodes the path and sends the type`
  - `putFile rejects on 507`
- [ ] **Step 2:** Run `npx jest tests/unit/utils/davFiles.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement it with `@nextcloud/axios`. The request token is sent automatically.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(turntable): check folder permissions and save files through WebDAV`

### Task 3: The recording composable

**Files:**
- Create: `src/composables/useTurntable.js`
- Test: `tests/unit/composables/useTurntable.test.js`

**Interfaces:**
- **Consumes:** Task 1.
- **`useTurntable({ renderer, scene, camera, controls, renderPaused })`** takes refs and returns:
  - `isSupported: ComputedRef<boolean>`
  - `isRecording: Ref<boolean>`
  - `progress: Ref<number>` (0–1)
  - `stoppedReason: Ref<?'hidden'|'stopped'|'error'>`
  - `record({ seconds, size, direction }): Promise<{ blob: Blob, extension: string, complete: boolean }>`
  - `stop(): void`
  - `dispose(): void`

**Behaviour:**
- **Before the first frame,** `record` remembers:
  - the renderer's size and pixel ratio;
  - the camera's position, aspect and projection matrix;
  - `controls.enabled` and the controls target;
  - `renderPaused`.
- **Setup:** it sets `renderPaused = true` and `controls.enabled = false`. Then it calls `renderer.setPixelRatio(1)` and `renderer.setSize(w, h, false)`, so the page layout doesn't move, and updates the camera aspect.
- **The frame loop:** a frame `i` from 0 to `frameCount − 1` is driven by `requestAnimationFrame`, but advances only when at least 1000/30 ms have passed. Each frame:
  1. sets `camera.position = orbitPosition(start, target, camera.up, i / frames, direction)` and calls `camera.lookAt(target)`;
  2. calls `renderer.render(scene, camera)`;
  3. calls `track.requestFrame()`;
  4. sets `progress = (i + 1) / frames`.
- **Stop and page visibility:** `stop()` ends after the current frame. A `visibilitychange` to hidden does the same, with `stoppedReason = 'hidden'`. In both cases the partial recording resolves with `complete: false`.
- **Restoring:** everything remembered is restored in a `finally`, whether recording finished, stopped or threw.
- **Overlapping calls:** a second `record` while recording rejects.
- **Disposing:** `dispose` stops any recording.

- [ ] **Step 1: Write the failing tests.** Fake `MediaRecorder`, `captureStream`, the renderer, the camera and the controls, then check:
  - `records frameCount frames and resolves complete`
  - `stop keeps a partial recording`
  - `hiding the page stops and keeps the recording`
  - `a render error restores everything`
  - `settings are restored after a normal finish`
  - `size and pixel ratio are set for 1080p without touching the canvas style`
  - `a second record while recording rejects`
  - `isSupported is false without MediaRecorder`
- [ ] **Step 2:** Run `npx jest tests/unit/composables/useTurntable.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(turntable): record one turn of the camera around the model`

### Task 4: Dialog, panel button and wiring

**Files:**
- Create: `src/components/TurntableDialog.vue`; `tests/playwright/turntable.spec.ts`
- Modify:
  - `src/components/SlideOutToolPanel.vue`: the Export section, after Screenshot (~line 469), and `emits`;
  - `src/App.vue`: the `@record-turntable` handler;
  - `src/components/ThreeViewer.vue`: wire `useTurntable` with `renderer`, `scene`, `camera.camera`, `camera.controls` and `renderPaused`; expose `openTurntable()`; the dialog lives here;
  - `src/config/icon-paths.js`: a `videoRecord` icon;
  - `l10n/en.json` (via `npm run i18n:sync`);
  - `docs/TECHNICAL.md`: a "Turntable video" section on formats, frame timing, what is and isn't in the video, and saving.
- Test: `tests/unit/turntableDialog.test.js`

**Interfaces:**
- **Panel button:** `'Record turntable'`. It emits `record-turntable` and is disabled while `!modelLoaded`. When `!isSupported`, it is also disabled with the title `"This browser can't record video"`.
- **`TurntableDialog` props:** `{ modelName, userId: ?string, dirPath: ?string, publicShare: boolean }`. It uses the `useTurntable` instance that `ThreeViewer` provides.
- **The dialog has three stages:**
  1. **Settings:**
     - a length range input from 4 to 15, step 1, showing `'{seconds} s'`;
     - a size `select`: `'720p'`, `'1080p'`, `'Window size'`;
     - direction as two `aria-pressed` buttons, `'Clockwise'` and `'Counter-clockwise'`;
     - a `'Record'` button.
  2. **Recording:** `NcProgressBar`, the line `'Recording… {percent} %'` in an `aria-live` region, and a `'Stop'` button. Any further clicks on the canvas are ignored.
  3. **Done:**
     - a `'Download'` button, which is primary;
     - `'Save next to the model'`, shown only when `!publicShare && userId && await canCreateIn(userId, dirPath)`;
     - a format line, `'Saved as WebM'` or `'Saved as MP4'`;
     - when the recording was cut short, `'Stopped early: the tab was hidden'` or `'Stopped early'`.
- **Saving:** `putFile(userId, dirPath, turntableFileName(modelName, ext, await listNames(userId, dirPath)), blob)`. On success, a toast says `t('threedviewer', 'Saved {name} next to the model', { name })`. On failure, a toast says `"Couldn't save the video"`.
- **Downloading:** it uses the same anchor-and-click approach as `useScreenshot.downloadScreenshot`, with `turntableFileName(modelName, ext, [])`.

- [ ] **Step 1: Write the failing component test:**
  - `the save option is hidden on public shares`
  - `the save option is hidden without create permission`
  - `stopped early shows why`
  - `controls have names, and the direction toggles use aria-pressed`
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement the dialog, the button, the wiring and the icon. Run `npm run i18n:sync`.
- [ ] **Step 4:** Run the component test. Expected: PASS.
- [ ] **Step 5: Write the Playwright spec.** Use Chromium, and serve the app as in `tests/playwright/inspection-tools.spec.ts`.
  - `records 4 s at 720p and downloads a WebM`: the download is a non-empty file whose first 4 bytes are `1A 45 DF A3`, the EBML magic.
  - `after recording, the canvas size, the camera and the controls are as before`
  - `save next to the model PUTs to the model's folder with a free name`: mock the PROPFIND with permissions `RGDNVCK`, and a listing that already holds `cube-turntable.webm`. The PUT URL ends in `cube-turntable%20(2).webm`.
  - `public share has download only`
  - `keyboard: open the dialog, record, stop and download with the keyboard`
- [ ] **Step 6:** Run `npm run build && npx playwright test tests/playwright/turntable.spec.ts`. Expected: PASS.
- [ ] **Step 7: Commit**: `feat(turntable): record a turntable video from the tools panel`

### Task 5: Changelog

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1:** Under `## [Unreleased]` → `### Added`, add:

  "Record a turntable video: one full turn of the camera around the model, 4 to 15 seconds at 720p, 1080p or your window's size, exactly as the viewer shows it. Download it as WebM (MP4 in Safari), or save it next to the model in your Nextcloud."

- [ ] **Step 2: Commit**: `docs(turntable): changelog for turntable video`
