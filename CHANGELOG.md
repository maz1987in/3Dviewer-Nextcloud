# Changelog

All notable changes to the 3D Viewer Nextcloud app will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **The markers drawn into the scene were still the debug palette.** The panels listing measurements and annotations were redesigned; the things they describe were not, so a measurement rendered as a fluorescent green bar between two pure yellow spheres and an annotation as a pure red dot beside red text in a black box — the same `#00ff00`/`#ffff00`/`#ff0000` family the ground grid carried for years, chosen at each of the nine places that drew something, so one measurement was two colours and clashed with every annotation beside it. They now come from one table holding the design system's canvas-chrome accents: green for measurements, amber for annotations, distinct so the two modes are tellable apart on the same model. Scene chrome cannot read the CSS tokens, which is why it needs a table rather than a stylesheet, and a guard now rejects a saturated primary or a named font in any of the three files that draw into the scene.
- **Every label was a wide black bar with a few pixels of text in it.** The canvas was 512x128 whatever the label said, so "0.98 mm" was eight small characters floating in the middle of it — and the mesh is only a few pixels tall on screen, so almost all of them went to the bar. Labels are now sized to their own text, with rounded corners, and the plane takes its width from the texture rather than from a multiplier the canvas knew nothing about: any label whose text did not happen to match the fixed 4:1 ratio had been rendering stretched or squashed.
- **Taking a measurement filled the viewport with flat green.** The line between two points is drawn as a cylinder — WebGL ignores `linewidth`, so a line of any thickness has to be geometry — and its radius is a percentage of the model's size, measured by taking a bounding box over every mesh in the scene. TransformControls keeps an invisible picker plane in the scene, sized so a drag can never run off the end of it: on a real instance it measures 107,700 units across, beside a model of 0.4. So the "model" was the picker, the 0.8% line was 861 units wide, and it was drawn with `depthTest: false` on top of everything. The two point markers were 1,615 units and invisible for it — a sphere large enough to contain the camera shows nothing, because its faces are then seen from behind. This had already been found and fixed once, in the annotation composable, whose comment names the picker plane by size; the comparison composable carried a character-for-character copy of the same fix, and the measurement composable — which had the scan inlined three times — never received it. There is now one definition of what counts as the model, and one function that measures it.
- **The measurements and annotations panels had never been redesigned.** Both were black boxes outlined in a saturated primary — `#0f0` for measurements, `#f00` for annotations, headings to match, rows tinted in the same colour, everything set in Arial. That is the palette you reach for to make an overlay findable while you are building it, and the same decision as the fluorescent green the ground grid carried for years. They are now one shared panel drawn twice, on the canvas chrome the performance HUD and the statistics panel use, with the sheet's cards: a delete on each entry, the reading itself as the largest thing in the card, and the annotation's note in an editable field rather than an unstyled input. A guard now rejects a debug colour or a named font in any panel that floats on the canvas.
- **Switching measurement mode on produced no visible change.** The panel floated at the right edge at a lower stacking order than the tools panel that turns the mode on, which is 320px at the same edge — so the panel appeared underneath it every time, and the only sign anything had happened was the row's own "Active" badge. Panels opened from the tools panel now step clear of it while it is open. Three separate mechanisms had been added to position these two overlays — a measured value written to a CSS variable, an `!important` block, and inline styles applied 200ms after a resize — none of which addressed what was actually covering them; all three are gone in favour of one declaration.
- **The measurements panel only appeared once there was something to list.** Taking a measurement needs two clicks on the model, and the panel is where that instruction lives, so the state where a user most needs it was the one state it did not render in. Both panels now show for as long as their mode is on, and say what to click.
- **The tools panel never announced the state it restored on load.** It emits `panel-opened` and `panel-closed`, and every call site emitted its own — except the one that reads the panel's last state back from `localStorage` on mount. Anything positioning itself around an open panel was told the panel was closed on exactly the loads where the user had left it open. One watcher on the state now does the announcing, so a new call site cannot forget.
- **The export format control and the slicer's format control both had labels that labelled nothing.** Each was a `<label>` with no `for`, sitting above its control: visually a caption, and to a screen reader an unlabelled combo box and three unrelated toggles. Export model is now a row like its neighbours with the format on the trailing edge, and the slicer's segmented control is a labelled group whose buttons carry a pressed state. Its per-slicer action reads "Open" rather than "Open in PrusaSlicer" — the row names the slicer already, and four buttons sized by the length of a brand name made a ragged column — with the full name kept as the accessible one.
- **The viewer drew a light card and a dark card on the same rendered model.** The statistics panel and the performance HUD float over the canvas a few hundred pixels apart, and each carried its own background — so which of the two the eye took as chrome depended on the model behind them. The statistics panel is canvas chrome and is now drawn as canvas chrome, from the same tokens as the HUD, through a shared `--hud` panel variant so the two surfaces cannot drift apart again. A browser check compares the panel against a live HUD rather than against a colour written in the test.
- **The performance HUD's mode chip was a pale blue pill with near-black text on a near-black panel.** It is the only chip in the app that is a button, and Nextcloud's server stylesheet paints every button on the page in the instance's pale primary tint — at a specificity a single class does not beat, at rest and in all three interactive states. Nothing in this app's stylesheet names that colour, so reading the CSS showed a chip that was fine. The browser fixtures had left out the rest-state colours of Nextcloud's button rule, keeping only its geometry and its states, which is why the chip measured correct at rest in every check while rendering wrong on the instance.
- **Half the model statistics panel was white text on a white panel.** The panel used to be a dark overlay; when it became a light one, the readout labels and values, the "No textures" and "+ N more" placeholders and the watertightness badge kept their old colours. Invisible text reads as a section that rendered nothing, which is how it was reported — as blank gaps rather than as unreadable text. Long material names also ran into their type with nothing between them.
- **The design system had the status colours backwards.** Nextcloud's `--color-warning` is a pale *background* tint and `--color-warning-text` is the readable foreground; mapping the plain name to the plain variable produced a token that meant a legible amber with Nextcloud absent and a near-white with it present. The unsuffixed token is now always the foreground and `-surface` always what it is drawn on, and the contrast check runs against a real Nextcloud palette as well as the sheet's own fallbacks — it had only ever tested the fallbacks, which is why it passed.
- **Every button in the viewer lost its colours the moment it was used.** Nextcloud's server stylesheet paints hover, focus and pressed states for every `<button>` on the page, through selectors that outrank a plain class — so clicking the Tools button left it pale blue under its own white text, at 1.2:1. The design system now claims those states, including `:focus` and not only `:focus-visible`: a mouse click leaves a button focused but not focus-visible, which is precisely the state Nextcloud's rule was winning. Verified by sweeping all 52 buttons on a running instance in each state.
- **The ground grid was fluorescent green on every theme, and the setting that was supposed to control it did nothing.** `#00ff00` was declared in six places — three entries in the grid config, both themes' `gridColor`, and a `setHex(0x00ff00)` written into the code that rebuilds the grid at the model's scale, which repainted it after every load no matter what the palette said. The settings panel disagreed with all of them, reading `#888888` from a defaults map of its own, so the swatch describing the grid's colour showed a colour the grid had never been. There is now one declaration, a neutral per theme, and the swatch shows the value the scene is using.
- **The viewer's buttons were the wrong shape on every real Nextcloud page.** Nextcloud's server stylesheet styles every button through `button:not(.button-vue, [class^="vs__"])`, which outscores a single class — and among the things it sets are `width: auto` and its own padding. An icon button is sized by nothing else, so it rendered 44 wide and 34 tall on a real instance while measuring perfectly square in every check that did not load Nextcloud's own CSS. The design system's button rules now outscore it.
- **The top bar crashed before a model was chosen.** It derived the format badge from the filename with `modelName.lastIndexOf('.')`, and the prop arrives as `null` until a file is opened — a prop default only fills in for `undefined`. The whole bar failed to render on the app's landing page. The extension is now read with `getFileExtension`, which had been handling that case correctly in the same module the whole time.
- **A "Model loaded" toast covered the Tools button on every page load.** Toasts appear at the top right, which is where the viewer's bar keeps Help and the primary Tools button, and the toast container was positioned 10px into that bar rather than below it — so for the few seconds the notice was on screen it swallowed clicks meant for the control underneath. Toasts and the tools panel now both clear the bar, whose height they read from one shared value rather than each carrying their own copy of it.
- **Ten style declarations had stopped applying.** A sweep in this release rewrote `var(--color-border, …)` and its neighbours to design system tokens, matching each fallback with a pattern that stops at the first closing bracket — and those fallbacks were `rgb(255 255 255 / 13%)`, so every rewrite left the `rgb()`'s bracket behind. `border: 1px solid var(--tdv-color-border));` does not parse, and a declaration that does not parse is dropped silently and on its own: the rule around it keeps working, the property just never applies. Nine borders and backgrounds on the navigation controller and the highlight on the last-used slicer were simply not being drawn. stylelint accepted all ten, as did the build and every test. A check that brackets balance now runs over every stylesheet.
- **The watertightness badges were pale green and pale amber on white.** Those colours were chosen against a near-black overlay, and the statistics panel that carries them is now a light surface — pale green text on a pale green tint on white measures 1.9:1, where 3:1 is the minimum for a non-text indicator. They use the themed status colours, which are the ones tuned for a light background. A browser check now measures each status colour against the surface it belongs to, which is also what keeps the two greens in the design system from collapsing into one: the panel green is unreadable on the HUD and the HUD green is unreadable on the panel.
- **The bundle size check picked which file to measure by the shape of its content hash.** Three build chunks are named `index-<hash>`, and the budget separated them with a regex written to exclude one specific hash — so whether the megabyte chunk was checked at all changed from build to build, and a build where the 250-byte chunk matched instead would have passed the budget without ever looking at the large one. It now takes the largest match, which is what was meant. The first build where it actually matched the right file, that file was 81 bytes over.

### Changed
- **The slicer dialog follows the sheet**: 560px rather than 800, the export format as one segmented control instead of three separate buttons, slicer rows quiet until hovered with the slicer's own colour carried by its action rather than by the whole card, and a backdrop that dims to 35% instead of 60% — the model behind the dialog is the thing the dialog is about.
- **The performance HUD and the model statistics panel follow the sheet.** The HUD is a 220px overlay on the canvas dark with a neutral mode chip, rather than a black box with a different accent colour for each of five performance modes — the word inside the chip already said which mode was selected, and the colour spent the HUD's only accent on that instead of on the readout in trouble. The statistics panel is drawn on the same surface: it floats over the model alongside the HUD, so it is chrome on the canvas rather than a panel beside it.
- **Every control in the viewer is drawn with a Material Design icon instead of an emoji** — 154 of them across nine components. Emoji are font, not artwork: the interface was a different set of pictures on Windows, on Android and on a Linux desktop, and a row of empty boxes where no emoji font is installed. They ignore `currentColor`, so a control could not dim when disabled or brighten when active, and a screen reader announced the character's Unicode name — "high voltage sign" — rather than the action. Two of them were drawn by CSS `content`, where no screen reader setting can reach them.
- **The tools panel is redesigned**, following the mockup: a floating card inset from the viewer's edges rather than a slab filling the right side, section headers reduced to a label and a chevron that rotates rather than swapping ▼ for ▶, and every row's picture replaced with a Material Design icon. Where the mockup drew an icon, the one used here is whichever package icon matches its path exactly rather than whichever looked closest.
- **The viewer's top bar is redesigned**, following the mockup: a 56px dark header, the filename centred with its format under it, an FPS pill whose dot turns amber and then red as frames are dropped, and Tools as the one primary button. The controls are Material Design icons rather than emoji — emoji are font, not artwork, so the toolbar was a different set of pictures on every platform and a row of empty boxes on a desktop with no emoji font; they also ignore `currentColor`, so they could not show a disabled or active state, and a screen reader announced the character's Unicode name instead of the action.

### Added
- **The Playwright suite now runs in CI**, and is required to merge. It has existed for a long time with nothing running it: `npm run test:e2e` and `npm run ci` both invoke it, no workflow did. Among what was never running is the accessibility guard for `src/css/forced-colors.css`, a sheet whose whole purpose is a failure mode nobody encounters by accident. Adding the workflow needs a matching change to the branch ruleset before the check is enforced on merges.
- **A browser check that the design system's tokens resolve.** The unit guards read the sheet as text and can tell a token is written as a Nextcloud variable rather than a pasted literal. They cannot tell whether the chain produces a colour when a browser evaluates it — which is exactly how a help icon came to be tinted from a variable Nextcloud does not publish, rendering nothing while reading correctly in the file. An unresolved background computes transparent, so a computed style catches what the text cannot.

### Fixed
- **A browser test had been failing since before v3.4.0 with nobody to see it.** `obj-mtl.spec.ts` stubs Nextcloud's globals, and its stub was missing `OC.filePath` — which the build uses to resolve every dynamically imported chunk, so the bundle's first import threw and the spec reported a mount failure for four minutes before timing out. A stub more limited than the thing it stands in for, reporting a failure that was its own.
- **One variable, five different ideas of what it means when it is missing.** `--color-main-text` was written with `#000`, `#222`, `#333`, `#d8d8d8` and `#fff` as its fallback in different rules; `--color-main-background` with both `#000` and `#fff`; `--color-border` with eight values across three files. Each copy was a separate decision about how an unthemed instance should render, and nothing ever compared them. All 224 references now go through the design system's tokens, so the mapping from Nextcloud's palette to this app's is stated once and the guard rejects a component reaching past it.
- **Dark mode asked the light theme what colour to be.** The viewer's theme is independent of Nextcloud's — the app resolves light or dark from its own setting or the system preference — so a Nextcloud in light mode with the viewer in dark mode is an ordinary state. In it, `--color-main-background` is white, and the viewer modal's dark rule reached for exactly that. The `#1e1e1e` written beside it as a fallback only applies where the variable is undefined, which on Nextcloud it never is, so the file said dark and the screen said white. Dark rules now state their own surfaces.
- **A help icon's background tint never rendered.** It was mixed from `--color-primary-element-rgb`, which Nextcloud does not publish — the variable appears nowhere among the 267 primary-variable references in `@nextcloud/vue` — and an unresolvable `var()` invalidates the declaration around it. Replaced with a `color-mix` of the primary, which needs no pre-split colour.
- **The dark theme reached four components that never received it.** `useTheme` puts `theme--dark` on the body, and two components style against it. The toolbar, the viewer and the toasts styled against `dark-theme` instead — a name only ever applied to the slicer dialog's own root element, which none of them is inside — so ten rules written for the dark theme matched nothing and always had. A selector that matches no element throws nothing and fails nothing; it renders exactly like a rule that is working while the theme is light, which is why this survived. All four now key off the class the app actually sets.
- **The slicer dialog followed the theme in one place and never in the other.** Its dark variant came from an `is-dark-theme` prop that the standalone app bound to the live theme and the Files-app viewer passed a literal `false`, so the same dialog behaved differently depending on where it was opened from. The prop is gone; the dialog reads the body class like everything else.
- **The viewer asked Nextcloud for the wrong primary colour in twenty-five places.** Nextcloud publishes two: `--color-primary` is the colour the admin picked, and `--color-primary-element` is that colour corrected until it passes contrast against the page background. They are identical on a default install, which is why the wrong one was invisible here — but on an instance themed pale, a divider drawn in `--color-primary` disappears into the surface it is meant to divide, and the file browser drew its selected-row borders and highlights that way. Every element colour now goes through the design system's tokens, which resolve to the corrected family.
- **The same variable carried three different fallbacks.** `--color-primary` was written with `#0082c9`, `#64b5f6` and `#0d47a1` as its default in different rules, so what an unthemed instance rendered depended on which rule an element landed on. Fallbacks now live once, in the token layer, where the default appearance is a decision that can be read rather than a value to be grepped for.

## [3.4.0] - 2026-07-28

Public share links now render 3D models, and every format that carries external textures resolves them there. Also carries the security fixes listed below.

### Added
- **A merge gate that treats an absent check as a failure**, as a ruleset on `main` and as `npm run pr:ready`. `gh pr checks` reports only the checks that exist, so a queued run contributes none and a pull request whose matrix has not started looks exactly like one where everything passed — which is how a broken eslint run reached `main`. The required set is the seven summary jobs: each aggregates its own matrix and reports unconditionally. Because the ruleset also covers pushes, work on `main` now goes through a pull request.
- **The integration suite now also runs on MySQL and PostgreSQL.** The version axis is covered on SQLite; this adds the database axis, which is where the queries differ rather than where the server does — `escapeLikeParameter()` picks an escape character per platform, and MySQL's default collation is case-insensitive where SQLite's and PostgreSQL's are not, so a folder listing settled on one backend is not settled on the others. Newest supported server only, rather than crossing both axes.
- **A PHP integration suite that runs against a real Nextcloud server**, covering what mocks cannot: real storage for the dependency route, and a real connection for the file browser's folder listing. Both bugs that reached production here — the `str_replace` prefix that reported folders like `modelstextures`, and `escapeLikeParameter()` called on the query builder, where the interface never declared it — are now caught, each verified by reintroducing it. The bootstrap exits non-zero when it finds no server rather than skipping, which is how the retired workflow managed to report coverage it never had.
- **FBX and 3DS textures now load on public shares**, which completes declaration-based resolution for every format carrying external textures. Both name their textures in binary structures, so they are walked — FBX node records, 3DS chunks — rather than searched for their marker bytes: a filename occurring inside vertex data is not a declaration, and treating it as one would let a crafted model name any file beside it. Walking also steps over mesh data by its declared length instead of reading it. The folder listing is now only a signed-in fallback.
- **COLLADA and X3D textures now load on public shares.** Both formats name their textures in the document, so they resolve by declaration through the existing `/dep/{name}` route, the way OBJ and glTF do — no folder listing, which is what needed a session and left them untextured. Matched with patterns rather than an XML parser: only the paths are wanted, and a parser on an uploaded document brings entity expansion with it. Signed-in sessions keep the folder-listing fallback for documents the patterns miss.
- **3D models are now viewable through public share links** ([#115](https://github.com/maz1987in/3Dviewer-Nextcloud/issues/115)). Share pages previously rendered nothing at all: `LoadFilesListener` returns early for anonymous visitors, so the bundle never loaded. A new `LoadPublicShareListener` hooks the public template.
- **Textures load on public shares.** OBJ materials, their maps and glTF buffers are served by name through `/public/file/{token}/{fileId}/dep/{name}`. The model's own declarations are the authorisation — an undeclared name is refused, as is any path escaping the model's folder.
- **Tests for both database migrations**, which had none. The load-bearing one pins the `sha256` folder-path digest across the three places it is computed — the migration backfill, `FileIndexService` on write, `FileIndexMapper` on read. Drift there silently returns empty folder listings rather than an error.
- **Doctrine DBAL stubs in `tests/bootstrap.php`.** `IQueryBuilder` takes its `PARAM_*` constants from Doctrine, which `nextcloud/ocp` does not require, so mocking `IDBConnection` used to fatal. No database-facing class had ever been unit-tested here.

### Changed
- **A successful model load no longer fills the console with warnings.** `getFileIdByPath` logged its normal progress at `warn` — the folder listing, the name being looked for, the move to subdirectories — so a model with ten textures produced twenty-odd warnings on a load where nothing was wrong, and a real one was indistinguishable from the noise. Routine steps are now `debug`; `warn` is left for a listing that failed, a subdirectory that could not be searched, and an unexpected error. A declared file that is genuinely absent is the caller's to report, which it already does once via `missingFiles` rather than once per lookup.
- **The signed-in texture lookup no longer guesses at a name that does not match.** About 150 lines of similarity rules — singular against plural, a leading word dropped, a length-ratio partial match, and a mapping from any colour-ish filename to any body-ish one — came from making one model work and then applied to every model. A rule that matches two different filenames is a guess, and a guess that lands wrong serves the wrong texture with nothing to say so. The case it was most likely to get right, a name differing only in case, is handled before that point and on the server since `PathLocator`; what remained only fired when a model referenced a file that is genuinely absent, where rendering untextured is the honest answer. `getFileIdByPath` goes from 366 lines to 155, and the conventional-texture-directory search that was duplicated in its catch block is now one function.
- **Unblocked dependency updates and refreshed the lockfile**, superseding ten stalled dependabot PRs (#104–#114) in one pass.
- **stylelint 17 rule fallout, all resolved** — `color-function-alias-notation` rewrote 30 `rgba()` calls across four files.
- **The 3D navigation controller is now a "Split console"**: a steering annulus with its buttons on an attached rail, styled from Nextcloud tokens. The eight decorative arrows are gone; arrow keys now steer a focused ring. The 15% dead zone, 110% hit slop and hold-to-repeat behaviour are unchanged.

### Fixed
- **A texture in a subdirectory the model does not name was only found if the directory had a conventional name.** The search that walks whatever subfolders the listing reports asked for each one without `includeDependencies`, and in that mode the server filters its answer to 3D models and drops every image — so the one pass written to find textures in subdirectories could never return one. A separate pass over sixteen hardcoded names (`textures`, `maps`, `images`, and case variants) covered the common cases and hid it, leaving a texture in a folder called `skin` or `PBR` unreachable with the folder sitting right there in the listing. Signed-in sessions only.
- **"Reset" and "Fit" could not be clicked.** The viewer's top bar is `position: absolute` inside a container that was not `position: relative`, so it anchored to the wrong ancestor and sat under the app content.
- **The navigation controller was hidden behind the app navigation**, which Nextcloud renders at `z-index: 1800`. It is now anchored to `.three-viewer`.
- **The 3D file browser invented folders that do not exist.** `getFolders()` stripped the parent prefix with `str_replace()`, which removes every occurrence: with no parent the prefix was a bare `/`, so `models/textures` was reported as `modelstextures` and matched no files.
- **`FileIndexMapper` called `escapeLikeParameter()` on the query builder**, where it is not declared — it lives on `IDBConnection`. It worked only because the server's concrete class happens to carry it, the same bet that fataled the Nextcloud 34 upgrade.
- **A test file was raw binary as far as git was concerned.** `\0\x01` reached `xmlModelDependencies.test.js` as literal bytes rather than escapes, and a NUL makes git stop producing diffs for a file — it had dropped out of line-level review while passing CI. A new guard scans source for C0 control bytes.
- **`composer test:unit` ran every test under `tests/`, not the suite its config names.** It passed a positional `tests` path, which overrides the configured testsuite — the same defect that made the old integration workflow run the unit suite under another name. Retiring that workflow left this copy of it in place, where it stayed invisible until a directory appeared that the glob should not have swept up.
- **A texture declared in a different case than the file rendered as missing.** 3DS keeps map names in DOS 8.3 form, so exporters write `WOOD.JPG` beside a file saved as `wood.jpg`; MTL files written on Windows do the same with subdirectories. The declaration matched — that lookup is already case-insensitive — and the fetch then asked storage for the path exactly as written, so the model rendered untextured with its texture sitting next to it. The exact path is still tried first; only a miss walks the model's own folder, stopping at the first segment with no match. Where both cases exist, the exact name wins.
- **The merge gate blocked a ready pull request after a force-push.** Every workflow here uses a concurrency group with `cancel-in-progress`, so superseding a running job leaves a `CANCELLED` entry in the status rollup beside the `SUCCESS` of the run that replaced it — both under the same check name. The gate read every entry and reported the superseded one as a failure. It now takes the most recent entry per name. This is the second state-reading defect in that script, so the deciding logic moved to `pr-ready-lib.mjs` and gained tests; a gate that cries wolf is the one people learn to merge past.
- **The case-insensitive lookup above covered the public route only, and only its last step.** An OBJ's textures are named by its material, so the material has to be read before they are known at all — and that read still asked for the exact path, so a `mtllib CHAIR.MTL` beside `chair.mtl` left every texture in it undeclared. Signed-in sessions missed for a second reason: `/api/files/find` and `/api/files/list` resolve the declared path themselves, and both matched case exactly, so `Textures/wood.png` beside a folder saved as `textures` found nothing. All three now share one implementation.
- **A path climbing out of the user's folder returned 500 instead of 404.** `Folder::get()` raises `NotPermittedException` for a path like `../../etc/passwd`, and `/api/files/find` caught only `NotFoundException` — so probing the endpoint produced an internal error and a logged stack trace apiece, and told the caller a refused path is not the same as an absent one.
- **Every viewer session logged a `PCFSoftShadowMap has been deprecated` warning.** Three.js r184 reassigns the constant on the first shadow pass, so the app was already rendering `PCFShadowMap`.

### Removed
- **Retired the "Integration Tests" workflow, which reported coverage it did not have.** `test:integration` and `test:migration` passed a positional path that overrode their configured testsuite, so both ran the unit suite under other names — and the job had no Nextcloud server to integrate against. `test-phpunit.yml` covers those tests across the same OCP 31–34 matrix.

### Security
- **Resolved four npm advisories in production dependencies** via `npm audit fix`, lockfile only: `form-data` CRLF injection ([GHSA-hmw2-7cc7-3qxx](https://github.com/advisories/GHSA-hmw2-7cc7-3qxx)), `postcss` path traversal ([GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849)), `fast-xml-builder` sanitisation bypasses, and nine in `dompurify`.
- **Cleared the `brace-expansion` DoS** ([GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) / CVE-2026-14257) from the production graph, taking `npm audit --omit=dev` from 7 high to 0. Only `brace-expansion@5.0.8` is patched, and it renamed its default export, so it cannot be forced globally; pinning `overrides.webdav.minimatch` to `^10.2.3` reaches it instead. Glob behaviour is unchanged and the advisory's proof of concept no longer exhausts the heap.
- **Capped material libraries per model** at `ModelDependencyResolver::MAX_MATERIALS`. Each `mtllib` name costs a storage lookup and ~226,000 fit in the scanned header, so one crafted model turned every `/dep/{name}` request on its public share into hundreds of thousands of lookups. The sharer can be the attacker, and the route has no rate limit.
- **Known residual: the shipped browser chunk still carries the unpatched `brace-expansion`.** Vite resolves `webdav` to a prebuilt bundle with it inlined, which no override can reach; it clears when `webdav` republishes. Unreachable in practice, since nothing here passes a `glob` to `getDirectoryContents`. The dev tree still reports the advisory through eslint 8 and jest.


## [3.3.2] - 2026-07-27

Security release. Upgrade immediately if you use password-protected link shares containing 3D models.

### Security
- **Share passwords were not enforced on the public 3D file endpoint.** `PublicFileController` extended plain `Controller` with `#[PublicPage]`, and `PublicShareMiddleware` returns early for anything that is not a `PublicShareController` — so no share authorisation ran at all. Combined with `ShareFileService::loadLinkShare()`, which only checked that `getShareByToken()` matched, anyone holding a share token could read the file regardless of its password. The token is the part of the URL people paste into chats and emails; the password exists precisely for when the token alone should not be enough. `PublicFileController` now extends `PublicShareController` and implements `isValidToken()`, `isPasswordProtected()` and `getPasswordHash()`, delegating password and token validation to the framework and picking up brute-force throttling with it. `findValidLinkShare()` additionally rejects non-link/email share types and expired shares, and treats a `ShareNotFound` from the share manager as "no share" rather than letting it escape as a 500. Present since the controller was added in `1b0ca86` (2025-09-15), so every release from v1.7.9 through v3.3.1 is affected. Verified on Nextcloud 34.0.2.1: a password-protected share now returns 404 without the password and 200 with it, ordinary public shares are unaffected, and expired shares return 404 instead of 500.

## [3.3.1] - 2026-07-27

Hotfix for Nextcloud 34. 3.3.0 is unusable on NC 34 — both the viewer page and every model download return HTTP 500, and the app cannot be upgraded or enabled. Nothing else changed.

### Added
- **Regression tests for both fatals.** `tests/unit/Service/ResponseBuilderCspTest.php` drives `addCspHeaders()` against a policy double that mirrors the NC 34 API surface with no `__call()` fallback, so it raises the same `Error` production did. `tests/unit/NoPrivateServerApiTest.php` scans `lib/` for any use of the private `\OC` container or the legacy `OC_*` static classes, stripping comments via `token_get_all()` first so documentation *about* a removed API isn't mistaken for a call to it. Both fail on the pre-fix code. Note that `composer test:unit` is not currently run by any CI workflow — `test-integration.yml` runs only `test:integration` and `test:migration` — so these are verified locally until that gap is closed.

### Changed
- **`nextcloud/ocp` dev dependency moved from `dev-stable30` to `dev-stable31`**, to match the `min-version="31"` declared in `appinfo/info.xml`; the weekly `update-nextcloud-ocp-matrix.yml` job, which had `target: ['stable30']` hardcoded and kept re-pinning it, now tracks `stable31` too. The pin deliberately follows *min*-version, not max: pinning to the oldest supported server is what stops us using APIs that don't exist there yet, and `ocp` stable33+ requires php `~8.2`, which cannot coexist with the `config.platform` php 8.1 that NC 31 support demands. Verifying against the newest branch is `psalm-matrix.yml`'s job — it already builds an ocp matrix across the full min..max range from `info.xml`. Psalm run manually against stable34 for this release confirms no further removed-API calls in `lib/` beyond the two fixed below, and flags ten `DeprecatedMethod` notices worth scheduling: `IConfig::getUserValue`/`setUserValue`/`deleteUserValue` in `PageController`, `SettingsController` and `ConfigController`, plus `IContainer::query` in `Application`. None break on 34.

### Fixed
- **App upgrade fataled on Nextcloud 34** ([#116](https://github.com/maz1987in/3Dviewer-Nextcloud/issues/116)) with `Call to undefined method OC\Server::getDatabaseConnection()`. The `Version010903Date20251121000000` migration reached into the private `\OC` server container in its constructor; NC 34 stripped `getDatabaseConnection()` from that class, which now exposes only `getUserFolder()`, `getWebRoot()` and `getL10N()`. It now resolves the connection through the public `OCP\Server::get(IDBConnection::class)` locator. Deliberately not constructor injection: `MigrationService::createInstance()` falls back to `new $class()` when the container cannot resolve a step, and an injected dependency would turn that fallback into an `ArgumentCountError`. The stale `use OC;` import is gone and `$connection` is now typed. Reported with a patch by [@EX0l0N](https://github.com/EX0l0N); same fix independently submitted as [#117](https://github.com/maz1987in/3Dviewer-Nextcloud/pull/117) by [@coverslide](https://github.com/coverslide).
- **Every model download and viewer page render fataled on Nextcloud 34** with `Call to undefined method OCP\AppFramework\Http\EmptyContentSecurityPolicy::addAllowedChildSrcDomain()`. Nextcloud removed the legacy `child-src` helper from its public CSP class (deprecated years ago in favour of the split `worker-src`/`frame-src` directives), so the call added in commit 4e0a532 ("fix CSP") became a hard error the moment the app ran on 34 — taking down `FileController::serveFile` and both `PageController` entry points, not just the worker policy. `ResponseBuilder::addCspHeaders` now calls `addAllowedWorkerSrcDomain('blob:')`, which is the correct directive for the blob-URL Web Workers that DRACO, KTX2 and web-ifc spin up, and has existed since NC 17 — safe across the whole declared 31–34 range. Reported in [#116](https://github.com/maz1987in/3Dviewer-Nextcloud/issues/116). The new `tests/unit/Service/ResponseBuilderCspTest.php` drives `addCspHeaders()` against a policy double that mirrors the NC 34 API surface exactly, so it reproduces the production `Error` on the old code regardless of which OCP branch happens to be vendored.

## [3.3.0] - 2026-04-20

### Fixed
- **3DS files loaded tipped on their side** when the exporter used Y-up instead of the 3ds-Max Z-up default. The loader had been hard-coded to rotate every 3DS model -90° around X (commit d8117a0, "fix: add coordinate system rotation corrections for Z-up formats"), which helped CAD-style Z-up files but silently broke Y-up exports — Cottage_FREE.3DS for example rendered with its long axis as the vertical. Dropped the unconditional rotation; 3DS files now pass through at their authored orientation. Most modern 3DS exporters (Blender, recent Maya) are already Y-up, and Z-up outliers can be fixed by orbiting or — if this becomes common — by a future user-facing orientation toggle. Other Z-up-rotating loaders (STL, PLY, 3MF, DAE) are unchanged because those formats have stronger Z-up conventions that are not affected by this fix. Reproduced and verified in the live Nextcloud container by downloading the user's 3DS via WebDAV, inspecting bbox dimensions with a new `scripts/inspect-3ds.mjs` harness (raw X=1243, Y=675, Z=1465 — Y is the height), and hard-refreshing the viewer page.
- **Standalone viewer: KTX2 loader threw on init** with `Cannot read properties of undefined (reading 'isWebGPURenderer')`, so models with Basis/KTX2-compressed textures silently fell back to placeholder textures. Root cause: the standalone `ThreeViewer.vue` never forwarded the live `WebGLRenderer` into the loading context, and Three.js r182's `KTX2Loader.detectSupport(renderer)` dereferences `renderer.isWebGPURenderer` before checking anything else. Fix: pass `renderer: renderer.value` in the context, plus a defensive guard in `gltf.js` that skips KTX2 entirely (with a warning) when no renderer is available instead of throwing. The modal viewer was unaffected — it already forwarded `this.renderer`. Live-E2E harness now also watches for KTX2/WebGPU console complaints so the regression can't sneak back in.
- **Standalone viewer: glTF models with embedded `data:` buffers failed to load** under Nextcloud's Content Security Policy. The app CSP allowed `data:` for `img-src` but not `connect-src`, so GLTFLoader's fetch() of embedded base64 buffers (the default export shape of many gltf files) was blocked by the browser. `ResponseBuilder::addCspHeaders` now also adds `data:` to connect-src. Caught end-to-end by driving Playwright against the real dev container (`scripts/live-e2e-check.mjs`).
- **Skip-to-viewer link wasn't in a usable tab position** — it was rendered inside `<NcContent>` → `<NcAppContent>`, which put it ~9 tabs deep behind Nextcloud's header, nav sidebar, and file list. Wrapped in `<Teleport to="body">` so the anchor lives at the body level regardless of where Nextcloud's chrome wraps us. DOM-verified focusable in the live container; clicking it moves focus to `#viewer-wrapper`. The CHANGELOG entry below that claims "first tab stop" was aspirational — Nextcloud's own `Skip to main content` / `Skip to navigation` links always win the first two positions, which is correct behavior we can't (and shouldn't) override.

### Added
- **Four more CAD formats via OpenCascade — STEP, IGES, BREP, FCSTD** (closes [#97](https://github.com/maz1987in/3Dviewer-Nextcloud/issues/97)): All four formats come from the OCCT family of NURBS/B-Rep CAD files and share one WASM integration. Uses `occt-import-js` (Viktor Kovacs's purpose-built emscripten port of OpenCascade's import + tessellation) — much smaller than vanilla `opencascade.js` (~7 MB WASM vs 10+) and with a JSON-based mesh output that's a clean fit for Three.js. Architecture: one shared `src/loaders/occt-runtime.js` exposes `getOcct()` (memoized module promise so the 7 MB WASM downloads once across all 4 loaders) and `buildGroupFromOccResult()` (walks the assembly hierarchy preserving node names, transforms are already baked into tessellated vertices so we don't reapply matrices). Each format gets a thin ~25-line loader: **STEP** (`.step`, `.stp`) → `ReadStepFile`, **IGES** (`.iges`, `.igs`) → `ReadIgesFile`, **BREP** (`.brep`, `.brp`) → `ReadBrepFile`, **FCSTD** (FreeCAD document) → unzip via fflate, filter for `.brep` entries, feed each to `ReadBrepFile` — per-body failures don't take out the whole document. The resulting bundle shape: four 1 KB loader chunks + one 725 KB shared `occt-runtime-*.chunk.mjs` + 7.3 MB WASM served separately from `/apps/threedviewer/occt/`. Main/app bundles unchanged (0 B trend). Not unit-tested because the whole pipeline needs live WASM + real CAD fixtures to exercise meaningfully; covered by the existing smoke suite pattern.
- **Fifth new format — IFC (`.ifc`)** ([#97](https://github.com/maz1987in/3Dviewer-Nextcloud/issues/97)): Industry Foundation Classes, the de-facto BIM interchange standard. Loader in `src/loaders/types/ifc.js` uses ThatOpen's `web-ifc` WASM (~5 MB, lazy-loaded on first `.ifc` open) and a hand-written Three.js bridge — `web-ifc-three` has been deprecated and its modern replacement (`@thatopen/components`) is a heavy framework we don't need just for file loading. Bridge logic: `StreamAllMeshes` walks the IFC element graph, each `FlatMesh`'s `PlacedGeometry` entries yield tessellated vertex data in interleaved `[px,py,pz,nx,ny,nz]` layout which we deinterleave into separate position/normal attributes, then apply `flatTransformation` (column-major 4×4) and per-geometry color. Express IDs (`expressID`, `geometryExpressID`) are preserved on `mesh.userData.ifc` for future property-panel tooling. Memory is carefully managed — `geometry.delete()` in a finally block releases the WASM-side handle per mesh, and `CloseModel` runs unconditionally so parse errors don't leak the full IFC model. WASM copies ship via `scripts/copy-decoders.mjs` to `/apps/threedviewer/web-ifc/` (both single-threaded `web-ifc.wasm` and multi-threaded `web-ifc-mt.wasm` — IfcAPI picks the variant based on runtime feature detection) so air-gapped Nextcloud deploys don't need CDN reachability. JS glue is lazy-chunked into a 3.4 MB `ifc-*.chunk.mjs` that only loads when a user opens a `.ifc` file; main/app bundle impact is minimal. Not unit-tested because the whole pipeline requires live WASM + real IFC fixtures; covered by the smoke spec suite instead.
- **Fourth new format — dotbim (`.bim`)** ([#97](https://github.com/maz1987in/3Dviewer-Nextcloud/issues/97)): JSON-based BIM format from dotbim.net — simple schema (meshes + elements with `{ mesh_id, vector, rotation, guid, type, color, info, face_colors? }`). Loader in `src/loaders/types/dotbim.js` handles mesh instancing (multiple elements sharing a `mesh_id` each get their own cloned geometry), element transforms (translation vector + unit quaternion rotation), RGBA byte colors, optional per-face colors (v1.1.0 schema — unindexes geometry so each triangle's 3 verts carry the face color), and tolerates legacy exporter quirks (missing/null `rotation`, mismatched `face_colors` length). Element metadata (`guid`, `type`, `info`) is stashed on `mesh.userData.dotbim` for future inspection tooling. 10 Jest specs in `tests/unit/loaders/dotbim-parser.test.js` cover instancing, transforms, color handling, transparency, legacy-rotation fallback, orphan elements, metadata, and JSON/schema validation error paths. Zero WASM, zero external deps, ~180 lines. Like the other new loaders it's lazy-chunked via the registry's dynamic imports — 0 B impact on the main/app bundles.
- **Three new 3D formats — OFF, AMF, 3DM** (closes [#97](https://github.com/maz1987in/3Dviewer-Nextcloud/issues/97) partially): (1) **`.off`** (Geomview Object File Format) — hand-rolled plain-text parser in `src/loaders/types/off.js` covering OFF, COFF (per-vertex colors, float or 0–255 int), N-gon fan triangulation, inline `#` comments, and binary-OFF rejection. 9-test Jest suite exercises the parse path end-to-end (tetrahedron, n-gon, comments, COFF float/int colors, degenerate inputs). (2) **`.amf`** (Additive Manufacturing Format) — wraps three.js's bundled `AMFLoader`, handles both XML and ZIP-compressed variants. (3) **`.3dm`** (Rhinoceros) — wraps `Rhino3dmLoader`, loads `rhino3dm.js` + `rhino3dm.wasm` (~4 MB) on first use from the app's bundled copy at `/apps/threedviewer/rhino3dm/` so air-gapped Nextcloud deployments don't need CDN reachability. `scripts/copy-decoders.mjs` now copies the rhino3dm assets alongside DRACO/Basis. All three formats are registered across the 5 sync points (`lib/Constants/SupportedFormats.php`, `src/config/viewer-config.js`, `src/loaders/registry.js`, `src/main.js::SUPPORTED_MIMES`, `appinfo/mimetypemapping.json`); `npm run format:check` PASS. Each loader is lazy-chunked via the registry's dynamic imports, so the main/app bundle size is unchanged (only users who open the new format pay the download cost). The 6 remaining formats from #97 (step, iges, brep, fcstd, ifc, bim) all require OpenCascade.js or web-ifc WASM (~5–10 MB each) and are deferred until demand justifies the bundle hit.
- **Forced-colors (Windows High Contrast) CSS hardening**: New central override sheet (`src/css/forced-colors.css`, imported from `main.js`) scoped entirely to `@media (forced-colors: active)` — no effect on default rendering. Addresses three patterns the a11y audit found: (1) custom badges (`.stats-badge`, `.fps-badge`, `.active-badge`, `.last-used-badge`) that rely on background-color + text-color alone collapsed into the surrounding surface once the UA repainted both with system colors; they now get a 1px `CanvasText` border so they stay visible. (2) `.filter-format-chip.active` lost its visual distinction from the inactive state because both backgrounds became `Canvas`; the active variant now uses `Highlight` / `HighlightText` with `forced-color-adjust: none` so selection state survives. (3) Focus states that suppressed `outline` and relied on `box-shadow` or colored `border-color` (`.export-select:focus`, `.annotation-text-input:focus`, `.skip-to-viewer:focus`) had no visible focus indicator; they now re-enable a 2px `Highlight` outline. Verified by a new Playwright spec (`tests/playwright/a11y-forced-colors.spec.ts`, 5 tests) that loads the real CSS file into static fixtures mirroring each component shape and asserts border/outline width > 0 under `emulateMedia({ forcedColors: 'active' })`. Caveat: Playwright's forced-colors emulation uses a neutral palette — this closes the keyboard/CSS correctness gap but an interactive Windows HC walkthrough is still the final source of truth for theme-specific contrast issues.
- **i18n parity tooling (`scripts/check-i18n.mjs`)**: Walks `src/` (`.vue`/`.js`/`.ts`) and `lib/` (`.php`) and extracts every `t('threedviewer', 'string')`, `this.t(...)`, and `->t(...)` call via regex. Diffs the extracted set against `l10n/en.json`: ERROR on source strings missing from en.json, WARN on orphan keys no source uses, per-locale coverage summary that reports missing, passthrough (value === key), and orphan counts. `--sync-en` auto-adds missing keys (value = key); `--prune` removes orphans. Wired as `npm run i18n:check` / `npm run i18n:sync`; `i18n:check` is now part of the `validate` chain. First sync closed 329 missing keys and pruned 87 orphans in en.json — ar/de/es coverage now reports accurately at ~27% (previously looked higher only because en.json itself was incomplete).
- **Export pipeline unit tests + MIME consistency fix**: Nine Jest specs in `tests/unit/composables/useExport.test.js` cover `getGeometryStats` (indexed, non-indexed, multi-mesh groups, non-geometry descendants) and `exportAsSTL`/`exportAsOBJ`/`exportAsGLB` (correct MIME — `model/stl`, `model/obj`, `model/gltf-binary` — correct byte length, null-object guards, and a multi-material OBJ scene that passes through the exporter with its material array and geometry groups intact instead of being flattened). Three.js exporters are mocked so the test runs deterministically in jsdom without pulling in Three's ESM-only subpath imports; the real exporter output remains covered by the Playwright smoke suite. Shipped alongside a MIME consistency fix in SlicerModal.vue — the slicer-export fallback path was still using `application/octet-stream` for STL and `text/plain` for OBJ even though the main Export Model path had been updated to `model/stl` / `model/obj`; both paths now agree.
- **Loader smoke-test coverage for cancel/retry/network-drop**: Two new Playwright specs in `tests/smoke/viewer.spec.ts` use `page.route()` to deterministically simulate (a) a user cancelling a hanging load and then retrying — the second fetch is fulfilled with a fixture and the viewer reaches `__LOAD_COMPLETE`, and (b) a network failure (`route.abort('failed')`) that must surface via `__LOAD_ERROR` without being misclassified as a user abort. ThreeViewer grew two tiny test hooks (`window.__LOAD_COMPLETE` on successful `model-loaded`, `window.__LOAD_ERROR` on non-abort errors) to give tests a DOM-independent signal — production code is unchanged in behavior.
- **Accessibility follow-ups**: Keyboard users now get a "Skip to 3D viewer" link as the first tab stop (visually hidden until focused, slides into view on focus) that jumps focus past the navigation directly to `#viewer-wrapper`. Both modals (SlicerModal, HelpPanel) now trap Tab/Shift+Tab inside the dialog while open and restore focus to the element that opened them on close — implemented via a dependency-free `useFocusTrap` composable. Modals also gained `aria-modal="true"` and `tabindex="-1"` on the dialog surface. Covered by a new Jest unit suite (`tests/unit/composables/useFocusTrap.test.js`) and a Playwright a11y spec (`tests/playwright/a11y-skip-link.spec.ts`) that verifies skip-link behavior under `forced-colors: active` (Windows High Contrast).
- **Transform Gizmo**: Translate, rotate, and scale models interactively with Three.js TransformControls. Mode selector (Move/Rotate/Scale) and reset button in the Analyze section. Disables orbit controls while dragging.
- **Animation clip selector**: Dropdown in the Animation panel to switch between individual animation clips (e.g., Run, Walk, Idle) for models with multiple animations
- **Texture optimization pipeline**: Quality presets (Original/High/Medium/Low) with Canvas 2D downscaling, memory tracking, and configurable setting in Personal Settings
- **X3D parser**: Full XML-based parser replacing placeholder cube — supports IndexedFaceSet geometry, materials, textures, transforms, and DEF/USE references
- **Volume & surface area measurement**: Model statistics panel now shows actual mesh surface area (sum of triangle areas) and mesh volume (signed tetrahedra method, accurate for watertight meshes), in addition to bounding box volume
- **Custom color palette editor**: Personal Settings → SlideOutToolPanel now exposes four user-overridable scene/chrome colors on top of the base light/dark theme: **background**, **grid**, **toolbar bg**, and **toolbar text**. Each has a native `<input type="color">` picker plus a per-key "×" clear button; a single "Reset all palette colors" button clears everything at once. Overrides persist to `localStorage['threedviewer:customPalette']` and are merged on top of whichever base theme (auto/light/dark) is active, so switching themes leaves your palette alone. The viewer rebuilds its `THREE.GridHelper` in place when `gridColor` changes and swaps `scene.background` when `background` changes — no reload required.
- **Decoder worker pool tuning (parallel decoding)**: `GLTFLoader`'s DRACO and KTX2 sub-loaders now call `setWorkerLimit(n)` with `n = min(hardwareConcurrency - 1, 4)` (floor 2), so GLB textures and compressed meshes decode in parallel across multiple Web Workers instead of serializing on one. Defensive feature-detection — falls through when the Three.js version doesn't expose `setWorkerLimit`. Result: GLBs with multiple KTX2 textures load noticeably faster on 4+ core machines without starving the main thread or flooding it with workers on 1-core devices.
- **Memory pressure auto-step-down**: The performance composable now samples `performance.memory.usedJSHeapSize` each frame and, when usage crosses 85 % of the configured `maxMemoryUsage` cap (default 500 MB), auto-switches to the **Low** performance mode — reducing pixel ratio, disabling shadows, and applying LOD. A one-time warning toast ("Auto-reduced quality — memory pressure") surfaces what happened; the flag clears once memory drops back below 70 % so the user can re-raise quality manually. 5-second cooldown prevents thrashing, and the check gracefully skips browsers without the non-standard `performance.memory` API (Firefox, Safari).
- **Background indexing status API + progress bar**: New `GET /api/files/index-status` endpoint backed by `ICacheFactory::createDistributed` returns `{ active, processed, total, percent, startedAt, updatedAt }` for the authenticated user. `FileIndexService.reindexUser` now pre-counts supported files (respecting `.no3d` and hidden-folder skip rules), then bumps the processed counter after each file. The Personal Settings "Re-index now" button starts a 750 ms poll in parallel with the blocking POST request and renders a live `NcProgressBar` ("142 / 284 (50 %)"), falling back to "Scanning…" until the pre-scan completes. Status TTL is 1 hour.
- **Adaptive texture streaming (visibility-aware queue)**: `useProgressiveTextures` now accepts a `(camera, scene)` streaming context and sorts its pending queue by frustum visibility before each batch — textures on meshes currently in view load first, off-screen ones are deferred. When the camera moves, the very next batch picks up the new viewpoint. `queueTexture` has a new optional `mesh` argument for visibility scoring; the signature stays backward-compatible, so existing callers are unaffected. ThreeViewer auto-registers the context on init so future loader pipelines that opt into progressive loading get adaptive scheduling for free.
- **Measurement suite upgrades**: The Statistics panel's measurement section is now a full measurement tool:
  - **Unit picker**: Choose mm / cm / m / in / ft / generic units from a dropdown; bounding box, surface area, and volume values re-render instantly with the right suffix (`mm`, `mm²`, `mm³`, etc.). Defaults to the project's configured `VIEWER_CONFIG.measurement.defaultUnit` so it matches the existing ruler tool.
  - **Per-mesh breakdown**: When a model has more than one mesh, a scrollable list shows each mesh's surface area and volume in the selected unit. Clicking a row focuses the panel on that mesh — the Width/Height/Depth/Area/Volume rows switch to its numbers and a "Focused: `mesh name`" header with a Show-all link appears. Helper meshes (transform-gizmo pickers, annotation markers) are excluded.
  - **Pick mesh in viewport**: A one-shot button arms a raycasting click handler on the canvas; the next click on a mesh focuses it in the stats panel. Works with any mesh in the loaded model, respects visibility, and skips gizmo helpers.
  - **Watertightness badge**: The section header flags each mesh as Watertight (all edges shared by exactly two triangles — volume is reliable), Not watertight (open or non-manifold edges detected — volume should be treated as approximate), or Unknown (non-indexed geometry, or >500k triangles so we skip the edge-map check for performance). Aggregated badge appears at the top of the section; per-mesh flags appear next to each row in the breakdown.
  - **Copy measurements**: A button copies a plain-text report of the current values (bounding box, surface area, mesh volume, bbox volume, watertight status, per-mesh table) to the clipboard in the selected unit. Uses `navigator.clipboard.writeText` on secure contexts with the textarea + `execCommand` fallback for legacy browsers. Success/error toast via the existing push-toast channel.
- **WebXR / VR mode**: Enter immersive VR via the 🥽 button in the top bar (only shown when the browser advertises `immersive-vr` support). Animation loop swaps to `renderer.setAnimationLoop` during XR sessions, and FPS throttling is bypassed since the headset enforces its own cadence. Testable without a headset using the Chrome WebXR API Emulator extension.
- **Annotation JSON export/import**: Save annotations as a versioned JSON document and re-import them later. The schema includes `format`, `version`, `exportedAt`, `modelFilename`, and an `annotations` array of `{ id, point, text, timestamp }`. Import/Export buttons appear in the Annotations overlay when annotation mode is active.
- **Scene comparison diff overlay**: When two models are loaded side-by-side via Comparison mode, a "Scene Diff" panel auto-appears showing original vs. comparison stats (vertex count, face count, mesh count, bounding box X/Y/Z, diagonal length) with color-coded deltas (green = increase, red = decrease). Helper meshes (transform gizmo pickers, axes/grid helpers) are excluded from stats so the diff reflects only the loaded geometry. The overlay is dismissable via × and re-openable from a "Diff" button in the comparison controls.
- **Annotations persistence (per-file backend save)**: Annotations now save automatically to your Nextcloud account, keyed by file ID, so they reappear next time you open the same model. Backed by a new `AnnotationsService` that stores one JSON document per (user, file) under app data (`appdata_*/threedviewer/annotations/{userId}/{fileId}.json`), with `GET`/`PUT`/`DELETE` routes at `/api/annotations/{fileId}` validating that you have access to the underlying file before reading or writing. Saves are debounced 600 ms after each change; clearing all annotations issues a `DELETE` so the backend doc is removed instead of storing an empty list. A small status pill ("Loading… / Saving… / Saved / Save failed") in the annotation overlay header surfaces sync state. 256 KB cap per document.
- **Shareable view link**: New "Copy View Link" button in the View section copies a URL that encodes the current camera viewpoint (position, target, zoom) as a compact `cam=px,py,pz,tx,ty,tz,z` query parameter. Opening the link reloads the model and restores the exact same angle after auto-fit runs, so you can send collaborators a link and say "check out this corner of the model" without needing a live session. Toast feedback on copy success/failure; button disabled until a model is loaded. Works on any secure context (HTTPS or localhost) via `navigator.clipboard`, with an offscreen-textarea + `execCommand` fallback for legacy environments. No backend — pure URL round-trip.
- **Clipping box (6-plane section analysis)**: The existing Cross-Section tool now has a Plane / Box mode switch. Plane mode is unchanged (single cross-section plane with axis + position slider). Box mode enables six axis-aligned clipping planes, one per face of the model's bounding box, each with an independent 0–1 offset slider that moves that face inward toward the opposite side. Setting `xMin=0.35` and `zMax=0.35`, for example, slices the leftmost 35% off along X and the nearest 35% off along Z, leaving the intersection slab visible with interior surfaces rendered via `DoubleSide`. A "Reset box" button returns all six offsets to 0. Plane and box state are kept independently so toggling between modes is non-destructive, and box offsets auto-remap when a new model is loaded.
- **File browser search & filters**: New filter toolbar in the file browser. At the Folders/Types/Dates **overview level** the search box runs a global recursive search that walks every folder, type, and date bucket and surfaces matching files as a flat results grid (each card showing its full path) — so searching `wolf` from the Folders root finds `Wolf-Blender-2.82a.glb` two folders deep without manual drilling. Inside **leaf views** (drilled into a folder, type, or month) the search filters both subfolder cards and file cards together, and unlocks two extra controls: multi-select format chips (one per extension actually present in the current view) and a size bucket dropdown (Any / < 1 MB / 1–10 MB / > 10 MB). Filters compose with AND between categories and OR within format chips, and a "Clear filters" button appears as soon as any filter is active. Filters auto-reset when navigating between folders/types/dates so a stale query never makes the next view look empty.

### Fixed
- **FBX taillight/lens transparency**: FBX post-processing was force-overriding every material to `opacity = 1.0; transparent = false`, which made authored translucent lens shells (taillights, headlights, glass) opaque and hid the coloured mesh inside — the Mercedes GLS rear lights rendered as a solid grey slab with the red only visible if the camera was pushed inside the body. Now preserves the FBX-authored opacity: materials with `0 < opacity < 1` are left transparent with `depthWrite = false` so inner meshes show through; only materials with `opacity <= 0` (which would render invisible) are still forced opaque.
- **Stats panel — File size on multi-file loads**: File Size showed "0.00 MB" for formats that come with sidecar assets (OBJ+MTL, FBX with textures, GLTF+BIN). The stats panel was reading `modelLoading.progress.value.total`, but multi-file loaders report progress as a percentage (max 100) rather than bytes, so the resulting "100 B → 0.00 MB" rounded to zero. Now reads the actual byte count from `modelSourceFiles.value[].size` (matching main filename first, else first file), with the progress-total value only used as a fallback when it looks like real byte counts (> 1 KB).
- **Stats panel — Texture memory accounting**: Textures section reported "Memory: 0.00 MB" while textures were still loading, because the loaded-image check used a 512×512 fallback that happened to resolve before decode — making tiny placeholders look real. Now distinguishes three states: loaded (dimensions ≥ 4×4 contribute to memory), pending (flagged separately so the UI can show "loading…"), and missing (1×1 placeholder or HTML `img` with empty `src` / zero `naturalWidth`). ThreeViewer polls analyzeModel once a second for up to 8 seconds after load when any texture is pending, so async decodes get picked up without the user needing to reopen the panel.
- **FBX dark rendering without textures**: When an FBX referenced textures (e.g. `texture.png`) that weren't shipped alongside the model, the loader substituted a 1×1 base64 placeholder into `mat.map`. `final = color × placeholder` then multiplied every surface down toward near-black, producing a silhouette-dark render where the Mercedes GLS looked like a blob. The loader now detects its own placeholder (1×1 image size) and nulls out `mat.map`; a new "clay mode" kicks in when *zero* textures resolved from dependencies, brightening near-greyscale dark material colours to a pleasant 0.75 clay-grey while hue-preserving the brightening on coloured materials (green license plate, red brake lights) so they still read as coloured instead of washing out to clay.
- **ZIP export — main file path**: The main model file is now packed under its basename (e.g. `eyeball.obj`) instead of its full Nextcloud path (e.g. `/3D files/Eyeball/eyeball.obj`). The leading slash is invalid in ZIP archives and broke extraction on some platforms.
- **ZIP export — preserved subdirectory layout**: Textures discovered in subdirectories (e.g. `textures/`) are now packed under their original relative paths in the ZIP instead of being flattened to the root, so the unzipped folder mirrors the original Nextcloud layout and re-imports cleanly.
- **Comparison mode loading 400 error**: `loadComparisonModelFromPath` was passing the `{ id, subdir }` object returned by `getFileIdByPath` directly into URL templates, producing `[object Object]` and a 400 from the file API. Now destructures `id` before use. (Latent regression from the earlier `getFileIdByPath` return-shape change.)

### Fixed
- **Animation playback**: Previously all animation clips played simultaneously, causing blended/static poses. Now only one clip plays at a time
- **Animation timeline seek**: Slider scrubber now correctly updates the model pose when dragged (replaced `mixer.setTime()` with `action.time` + `mixer.update(0)`)
- **Animation loop toggle**: Toggling Loop off and back on no longer leaves the animation stuck; finished LoopOnce actions properly restart
- **FBX rendering**: Fixed dark/black eyeball — upgraded Lambert to Phong materials, added SRGBColorSpace, normalized scale, detected transparent shells
- **PLY loader**: Preserved original vertex normals from file instead of always recomputing them

## [3.2.0] - 2026-04-05

### Added
- **Cross-Section tool**: Interactive clipping plane to slice models along X/Y/Z axes with position slider, flip direction, and DoubleSide rendering for visible interiors
- **Animation Timeline Scrubber**: Seek to any point in animated models with a slider, step forward/backward frame-by-frame
- **View Bookmarks**: Save and restore camera positions with display toggles (grid, axes, wireframe, background), persisted in localStorage
- **Lighting Presets**: Quick-switch between 5 lighting setups (Default, Studio, Outdoor, Dramatic, Flat) affecting ambient, directional, and point lights

- **Exploded View**: For multi-mesh models, animate parts outward from centroid with adjustable explosion factor slider
- **Slicer: Export format selector**: Choose STL, OBJ, or PLY before sending to slicer (non-passthrough formats)
- **Slicer: Upload progress bar**: Real-time progress indicator when uploading to server (XMLHttpRequest with progress events, 2-min timeout)
- **Slicer: Copy share link**: Copy the temporary Nextcloud share URL to clipboard for manual use
- **Slicer: Size validation**: Warns and blocks uploads exceeding 50MB before attempting server transfer
- **Slicer: Upload size display**: Shows file size in MB during upload for files >5MB
- **Modal viewer stats panel**: Lightweight model info overlay (meshes, vertices, faces, dimensions) accessible via bottom-right button
- **Modal viewer screenshot**: Download a PNG screenshot of the current view from the modal preview
- **Cache settings in Personal Settings**: Configurable max cache size, max file size, expiration days, enable/disable toggle, and clear cache button
- **Cache hits/misses in performance overlay**: Shows individual hit and miss counts alongside hit rate percentage
- **Cache privacy documentation**: Documented local-only storage, per-browser isolation, and user control in TECHNICAL.md
- **Multi-file matching test suite**: 48 tests covering texture/MTL name matching strategies (space normalization, prefix removal, plural handling, color/body mapping, partial matching)
- **Edge case fixtures**: mixed-case extensions, missing MTL, orphaned textures for multi-file loading tests
- **Export triangle count warnings**: Toast notifications for large models (>500K info, >2M warning) before export starts
- **Export MIME type fix**: STL exports use `model/stl`, OBJ exports use `model/obj` instead of generic types
- **Help panel refresh**: Added Slicer & Export section, cross-section, exploded view, lighting presets, bookmarks, dependency cache documentation
- **i18n audit**: Wrapped hardcoded export/error toast strings in `t()`, added 31 new keys to `l10n/en.json`, documented i18n checklist in TECHNICAL.md
- **Accessibility review**: Added `role="dialog"` + `aria-labelledby` to SlicerModal, `aria-controls` on all 6 panel section headers, `aria-label` on emoji-only buttons, `role="alert"` on texture warning, `role="region"` on stats panel
- **Format parity guard**: Build-time script (`npm run format:check`) validates that PHP, JS, loader registry, Viewer MIME list, and mimetypemapping.json stay synchronized
- **X3D/VRML MIME registration**: Added `model/x3d+xml` and `model/vrml` to Nextcloud Viewer MIME list so these formats open in the viewer
- **Slicer security documentation**: Documented full security posture — authentication, path traversal prevention, MIME validation, size limits, share expiry, and file lifecycle in TECHNICAL.md

### Fixed
- **Slicer OBJ/PLY upload**: Added `obj` and `ply` to backend upload allowlist — OBJ/PLY format selector was added to frontend but backend rejected these formats
- **EufyStudio URL parsing**: Replaced fragile regex filename extraction with proper URL parsing
- **Slicer upload timeout**: Added 2-minute timeout to XMLHttpRequest (previously no timeout — could hang forever)

### Changed
- **Tools panel redesign**: Reorganized from 4 sections to 6 (View, Scene, Analyze, Animation, Export, Settings) for clearer grouping
- **Toggle switches**: Replaced text checkmarks with custom CSS toggle switches for Grid, Axes, Wireframe, and Loop controls
- **Export section**: Screenshot, Export Model, and Send to Slicer moved from Settings to dedicated Export section
- **Animation section**: Elevated from nested group to its own collapsible section (conditional, only shown for animated models)
- **Model Statistics**: Moved from Settings to Analyze section alongside Measurement, Annotation, and Cross-Section

### Fixed
- **Theme consistency**: Unified `--color-primary-element` fallback values across all components to `#0082c9` (Nextcloud default), replacing inconsistent `#4287f5`, `#1976d2` fallbacks
- **MinimalTopBar hardcoded colors**: Replaced 7 instances of hardcoded `rgb(0 130 201)` with `var(--color-primary-element)` and related NC variables
- **Dark theme hack removed**: Deleted ~130 lines of `.dark-theme` CSS overrides (46 `!important` declarations) from SlideOutToolPanel — dark mode now works automatically via Nextcloud CSS variables
- **Cache stat colors**: Replaced hardcoded Material Design hex colors with NC semantic variables (`--color-success-text`, `--color-warning-text`, `--color-error-text`)
- **Missing panel props**: Added `wireframe`, `background-color`, `performance-mode`, `theme-mode`, `has-animations`, `is-animation-playing` props to SlideOutToolPanel binding in App.vue
- **Clipping plane Z-fighting**: Added 5% margin beyond model bounds so the slider at extremes doesn't cause Z-fighting artifacts
- **Bundle budget**: Updated app chunk thresholds for new features (+12KB raw)

## [3.0.0] - 2026-04-02

### Changed
- **Dependencies**: Updated development dependencies
  - `@babel/core`: ^7.28.6 → ^7.29.0
  - `@babel/plugin-transform-runtime`: ^7.28.5 → ^7.29.0
  - `@babel/preset-env`: ^7.28.6 → ^7.29.0
  - `@playwright/test`: ^1.56.1 → ^1.58.2
  - `jest-environment-jsdom`: ^29.7.0 → ^30.3.0
  - `vue`: ^2.7.16 → ^3.5.0
  - `@nextcloud/vue`: ^8.33.0 → ^9.5.0
  - `@nextcloud/vite-config`: ^1.7.1 → ^2.5.0
- **Vue 3 migration**: Migrated app from Vue 2 to Vue 3
  - `main.js`: `new Vue()` + `Vue.mixin()` → `createApp()` + `globalProperties`
  - `settings-personal.js`: `Vue.extend()` → `createApp()`
  - `viewer-api.js`: `new Vue()` / `$mount()` / `$destroy()` → `createApp()` / `app.mount()` / `app.unmount()`
  - `ViewerWrapper.js`: New Vue 2 bridge component — Nextcloud Viewer bundles Vue 2 internally, so a plain JS wrapper renders in Vue 2 and creates an isolated Vue 3 `createApp()` inside for the real ViewerComponent
  - Removed `@vue/vue2-jest` (Vue 2 specific)
- **Nextcloud 34 compatibility**: `min-version` 31, `max-version` 34 (`@nextcloud/vue` v9.x requires NC 31+)
- **Vue component imports**: Migrated deep imports (`@nextcloud/vue/dist/Components/...`) to barrel imports (`@nextcloud/vue`) for forward compatibility with `@nextcloud/vue` v9
- **Template modifiers**: Removed deprecated `.native` event modifiers from Vue components (compatible with Vue 2.7+, required for Vue 3)
- **@nextcloud/vue v9 API migration**: Updated all form component bindings to Vue 3 API
  - `NcCheckboxRadioSwitch`: `:checked` → `:model-value`, `@update:checked` → `@update:model-value`
  - `NcTextField`: `:value` → `:model-value`, `@update:value` → `@update:model-value`
  - `NcSelect`: `:value` → `:model-value`, `@input` → `@update:model-value`
  - `NcSettingsSelectGroup`: `:value` → `:model-value`, `@update:value` → `@update:model-value`
- **Bundle budget**: Updated index chunk thresholds in bundle size checker

### Fixed
- **npm audit**: Resolved dependency vulnerabilities via `npm audit fix` ([#77](https://github.com/maz1987in/3Dviewer-Nextcloud/pull/77))
- **npm audit**: Applied non-breaking security patches, reducing vulnerabilities from 43 to 25 (42% reduction)
- **Lint**: Fixed `one-var` error in `useThumbnailCapture.js`
- **Animation loop toggle broken**: `AnimationMixer.LoopRepeat`/`LoopOnce` are module-level constants, not static properties — `setLoop(undefined)` made loop toggling non-functional. Imported `LoopRepeat`/`LoopOnce` directly from `'three'` (`useAnimation.js`, `useComparison.js`)
- **Model load errors invisible to user**: Variable shadowing in `handleLoadError` — parameter `error` shadowed the `error` ref, so `error.value = error` was a no-op. Renamed parameter to `loadError`, fixed logger level from `info` to `error` (`useModelLoading.js`)
- **Lights leak on re-setup**: Vue 3 proxy wraps items in `ref([])` arrays — `scene.remove(proxy)` doesn't match raw Three.js objects via `indexOf`. Added `toRaw()` for light/helper removal and `instanceof` checks (`useScene.js`)
- **Toast auto-dismiss broken**: `ToastContainer` was mutating the `toasts` prop directly (setting `progress`/`paused` on prop objects), which triggers Vue 3 warnings and breaks in strict mode. Moved progress and paused state to local `data()` (`ToastContainer.vue`)
- **Mobile touch listener leak**: `setupPinchZoom()` and `setupDoubleTapReset()` added document event listeners but never stored references for cleanup. Stored refs in `eventListeners` and added removal in `dispose()` (`useMobile.js`)
- **Settings page form controls not responding**: `@nextcloud/vue` 9.x changed all form component props from `checked`/`value` to `modelValue`. Updated all bindings in `PersonalSettings.vue`
- **CSS nesting bug**: `.select-group-row` rule was nested inside `.setting-row` braces — silently dropped in browsers without CSS Nesting support. Moved to separate rule block (`PersonalSettings.vue`)
- **Viewer registration errors silent**: Both `registerViewerHandler` and `registerViewerHandlerLegacy` had empty catch blocks — any registration failure was invisible. Added `logger.error()` calls (`viewer-api.js`)
- **Loader errors invisible**: All `BaseLoader` logging methods (`logInfo`, `logWarning`, `logError`) had empty bodies. Delegated to project logger (`BaseLoader.js`)

### Technical
- PHP CS Fixer: Blank lines before returns, doc comment whitespace, type-cast spacing, removed unused imports
- OpenAPI spec: Regenerated with slicer and thumbnail controller tags and updated description
- Three.js + Vue 3 pattern: `shallowRef` for single Three.js objects, `ref` for arrays, `toRaw()` when passing proxied objects to Three.js APIs
- Vue 3 Maps pattern: Maps moved to `created()` hook as non-reactive instance properties (`this._timers`) to avoid Vue 3 proxy breaking `Map.has()`/`Map.get()`

## [2.3.4] - 2026-01-18

### Changed
- **Dependencies**: Updated development dependencies
  - `@babel/core`: ^7.28.5 → ^7.28.6
  - `@babel/preset-env`: ^7.28.5 → ^7.28.6
  - `postcss-html`: ^1.7.0 → ^1.8.1
  - `vite`: ^7.2.7 → ^7.3.1

### Fixed
- **Nextcloud Subfolder Compatibility** ([#74](https://github.com/maz1987in/3Dviewer-Nextcloud/issues/74))
  - Fixed app not working when Nextcloud is installed in a subfolder (e.g., `https://example.com/nextcloud/`)
  - Replaced all hardcoded `/apps/threedviewer/...` paths with Nextcloud's `generateUrl()` and `imagePath()` functions
  - API endpoints, decoder paths, and static assets now correctly respect the configured webroot
  - Affected files: multiFileHelpers.js, useModelLoading.js, useComparison.js, gltf.js, ViewerComponent.vue, SlicerModal.vue, App.vue, viewer-config.js

## [2.3.3] - 2026-01-15

### Added
- **Automatic Thumbnail Generation**: 3D model thumbnails are now automatically generated when viewing files
  - Thumbnails are captured with smart cropping to focus on model content
  - Grid and axes are hidden during capture for clean previews
  - Thumbnails stored in Nextcloud app data (not in user files) to avoid cluttering recent files
  - User setting to enable/disable thumbnail generation in Personal Settings → 3D Viewer → Thumbnails
  - "Clear thumbnails" button in settings to delete all stored thumbnails
  - Works in both standalone viewer and Nextcloud Files integration modal
- **Thumbnail Settings**: New Thumbnails section in Personal Settings
  - Toggle to enable/disable automatic thumbnail generation
  - Clear thumbnails button with confirmation dialog and count of deleted files

### Changed
- Thumbnails are now stored in Nextcloud's internal app data folder instead of user folder
  - Prevents thumbnails from appearing in "Recommended files" and recent files lists
  - Improved privacy and cleaner user file space

### Technical
- New `ThumbnailService` using `IAppData` for app-internal storage
- New `ThumbnailController` with endpoints for storing and clearing thumbnails
- `useThumbnailCapture` composable with smart content-aware cropping
- Thumbnail capture integrated into both `ThreeViewer.vue` and `ViewerComponent.vue`

## [2.3.2] - 2026-01-07

### Changed
- **Dependencies**: Updated development dependencies
  - `stylelint-scss`: ^6.13.0 → ^6.14.0 (dev)
    - Enhanced `dollar-variable-no-missing-interpolation` to flag namespaced variables in custom properties
    - Extended `function-disallowed-list` to detect disallowed functions within `@return` expressions
    - Fixed false positives in `dollar-variable-no-missing-interpolation` when variables already exist inside interpolation

## [2.3.1] - 2026-01-07

### Fixed
- **"Send to Slicer" Button Always Disabled**
  - Fixed missing `modelLoaded` prop binding in SlideOutToolPanel component
  - Button now correctly enables when a model is loaded
  - Affects STL and all other 3D model formats

- **CRITICAL: Cron Job Fatal Error** ([#65](https://github.com/maz1987in/3Dviewer-Nextcloud/issues/65))
  - Fixed `foreach() argument must be of type array|object, null given` error in CleanupTempFiles cron job
  - Removed incorrect `foreach` wrapper around `callForAllUsers()` method

- **CRITICAL: Missing Exception Method**
  - Added missing `getExtension()` method to `UnsupportedFileTypeException` class
  - Fixed fatal error when attempting to access extension information from unsupported file type exceptions
  - Updated all exception throw sites to include extension parameter

- **CRITICAL: Insecure Rate Limiting**
  - Replaced insecure session-based rate limiting with distributed cache implementation
  - Uses `ICacheFactory` for thread-safe, multi-server compatible rate limiting
  - Prevents rate limit bypass by session clearing
  - Improved scalability for large installations

- **HIGH: IP Address Spoofing Vulnerability**
  - Replaced custom IP detection with Nextcloud's secure `$request->getRemoteAddress()` method
  - Prevents IP spoofing via forged X-Forwarded-For headers
  - Properly respects trusted proxy configuration

- **HIGH: Path Traversal Vulnerability**
  - Fixed path traversal vulnerability in temp folder verification (SlicerController)
  - Replaced insecure `strpos()` checks with proper `str_starts_with()` path validation
  - Prevents unauthorized file access via path traversal attacks

- **MEDIUM: HTTP Header Injection**
  - Fixed potential header injection in Content-Disposition header (PublicFileController)
  - Replaced `addslashes()` with proper RFC 2231 encoding using `rawurlencode()`
  - Prevents header injection via malicious filenames

### Improved
- **Temp File Cleanup Enhancements**
  - Added comprehensive logging for NotFoundException cases
  - Implemented cleanup statistics tracking (files deleted, shares deleted, users processed, errors)
  - Improved share deletion error handling with separate method and individual error logging
  - Added file type validation to skip directories during cleanup
  - Added progress logging every 100 users for large instances
  - Added stack traces to error logs for better debugging

## [2.3.0] - 2025-12-28

### Added
- **G-code Visualization Enhancements**
  - Smooth rainbow spectrum gradient coloring across entire model
  - Intelligent filtering of travel moves, retractions, and parking movements
  - Skip movements exceeding 50mm in XY plane to remove edge artifacts
  - Fixed vertex color handling for proper gradient display when toggling modes

- **Mobile View Optimizations**
  - Responsive MinimalTopBar with all icons visible on small screens
  - Help panel displays full-screen with sticky header on mobile
  - Smooth scrolling support for iOS devices
  - Performance stats overlay hidden by default on mobile and screens ≤768px

- **G-code Toolpath Visualization**: Added support for G-code files used in 3D printing and CNC machining
  - New G-code parser supporting G0/G1 movement commands
  - Automatic layer detection based on Z-height changes
  - Color-coded visualization with different colors per layer using HSL gradient
  - Support for multiple file extensions: `.gcode`, `.gco`, `.nc`, `.acode` (AnkerMake)
  - MIME type registration: `text/x-gcode`
  - Custom file type icon for G-code files
  - Toolpath rendered as 3D line segments with configurable transparency

- **Extended G-code Ecosystem Support**
  - Additional extensions recognized and routed to the G-code loader: `.g`, `.gx` (FlashForge), `.g3drem` (Dremel), `.makerbot`, `.thing`
  - MIME mappings added for container variants: `application/x-gcode` for `.gx`, `.g3drem`, `.makerbot`, `.thing`
  - Viewer “By Type” browser now lists these extensions via `SUPPORTED_FORMATS` config

### Changed
- **Backend Listing Filters**: Updated `FileController` filters to include G‑code-related extensions in Folders, Type, and Date views so these files surface across all navigation modes
  - Applies to folder-scoped listing, type grouping, date grouping, nested folder inclusion checks, and descendant checks
- **Slicer Handoff Options**: Simplified send-to-slicer flow by letting users pick passthrough extensions; all other formats now auto-convert to STL by default (export-format selector removed)
- **G-code Visualization Default**: Default toolpath color mode is now gradient instead of single-color orange for clearer multi-layer contrast

### Dependencies
- Updated @nextcloud/dialogs from 7.1.0 to 7.2.0

## [2.2.0] - 2025-12-17

### Added
- **Measurement & Annotation Visual Sizing Controls**: Added per-user sliders to control measurement and annotation visuals
  - New Personal Settings section for adjusting measurement point size, line thickness, and label width
  - New Personal Settings sliders for annotation point size and label width
  - Settings are stored per user via `SettingsController` and merged into `VIEWER_CONFIG.visualSizing`
  - Measurement and annotation composables (`useMeasurement.js`, `useAnnotation.js`) now derive sizes from configurable percentages of the model size
- **Animation Controls in UI**: Added animation play/pause controls to viewer interface
  - Animation play/pause button in MinimalTopBar component
  - Animation controls section in SlideOutToolPanel with play/pause and loop toggle
  - Animation state props passed through App.vue to child components
  - Integration of useAnimation composable in ThreeViewer component
  - Improved directory path extraction for multi-file model loading
- **Dependency Cache Insights**: Added live cache statistics (size, entries, hit rate) to the viewer and slide-out tools
  - Viewer performance panel now shows cache size and hit rate
  - Slide-out tools panel displays cache stats and clear-cache control with status
  - Cache stats refresh automatically during use and after model loads or cache clears
  - Cache hit/miss tracking with reset when clearing the cache
- **Performance Scaling for Large Models**: Automatic performance mode suggestions and easy mode switching
  - Configurable triangle count thresholds (warn: 500K, strong: 1M faces) for detecting heavy models
  - Automatic toast notification suggesting performance mode for models exceeding thresholds
  - Clickable performance mode label in stats overlay to cycle through modes (Auto → Low → Balanced → High → Ultra)
  - ViewerToolbar performance button now cycles through modes instead of toggling stats
  - Performance mode changes apply immediately with visual feedback
- **Slicer Temp File Security Hardening**: Enhanced security for temporary file uploads
  - File size validation: 50MB per file limit, 200MB rolling folder cap
  - MIME type validation for STL files with header checking
  - Rolling 24-hour expiration enforced on file access
  - Increased cleanup frequency from 24h to 6h for faster expiry enforcement
  - Comprehensive audit logging for creation, access, and deletion events
  - Security posture documented in TECHNICAL.md
- **Automated Bundle Budget Enforcement**: Enhanced bundle size checking with historical tracking
  - Comprehensive budget thresholds for all major bundles (main, loaders, app, three-core, index, nc-select)
  - Historical size trend tracking in bundle-sizes.json (last 50 builds)
  - CI workflow uploads bundle size history as artifact (90-day retention)
  - Size trend comparison shows changes vs previous build
  - Improved error reporting with formatted bytes and clear failure messages
  - Fails CI builds when budgets are exceeded (with environment variable overrides)
- **Vue 3 Migration Pre-Work**: Eliminated Vue 3 incompatible patterns to prepare for future migration
  - Replaced deprecated lifecycle hooks (`beforeDestroy` → `beforeUnmount` in ViewerToolbar, ToastContainer, ViewerComponent, viewer-api.js)
  - Added explicit `emits` declarations to all components (ViewerToolbar, ToastContainer, ViewerComponent, ViewerModal, FileNavigation, FileBrowser)
  - Verified no implicit `$listeners` usage (removed in Vue 3)
  - Added comprehensive migration notes to COMPOSABLES_API.md with dependency compatibility matrix
  - Audited dependencies: `vue` 2.7 → 3.x (API compatible), `@nextcloud/vue` 8.x → 9.x (requires Nextcloud 30+)

### Changed
- **Cache Statistics Updates**: Improved cache stats refresh frequency from 5 seconds to 2 seconds for more responsive UI
- **Performance Mode Controls**: Enhanced performance mode switching with clickable controls
  - Performance mode label in stats overlay is now clickable to cycle modes
  - ViewerToolbar performance button cycles modes (preserves MinimalTopBar toggle behavior)
  - All mode changes apply immediately with proper event propagation
 - **Dependencies**: Updated core runtime and build tooling
   - `three`: ^0.181.2 → ^0.182.0 (patch update)
   - `vite`: ^7.2.6 → ^7.2.7 (dev, patch update)
 - **Security Workflow**: Updated GitHub Actions CodeQL workflow to use `github/codeql-action` v4 in preparation for the v3 deprecation in December 2026

### Fixed
- **Toast Event Handling**: Fixed missing `push-toast` event handler in App.vue preventing performance suggestion toasts from displaying
- **ViewerModal Performance Mode**: Fixed performance mode cycling in ViewerModal component by adding proper prop passing and event handling
- **Model Comparison Positioning**: Fixed comparison model positioning issues where the second model's position was immutable
  - Wrapped comparison model in a Group to neutralize baked position offset from loading
  - Fixed parent-child relationship handling by using toRaw() to get actual Three.js objects instead of Vue proxies
  - Ensured matrixAutoUpdate is enabled for wrapper and all children for proper render loop updates
  - Fixed matrix validation order: validate parent matrices before child objects to prevent "Cannot read properties of undefined" errors
  - Improved scene hierarchy validation to include all objects (grid, axes, lights) not just models
  - Fixed matrix update sequence: call updateMatrix() on all objects before updateMatrixWorld() to ensure proper transformations
  - Comparison models now position correctly side-by-side with proper spacing and alignment
- **CSP Compliance for Texture Loading**: Fixed Content Security Policy violations when loading GLB/GLTF models with embedded textures in Nextcloud modal viewer
  - Patched `Image.prototype.src` setter to automatically convert blob URLs to data URIs for texture loading
  - Patched `URL.createObjectURL` to track blob-to-URL mappings for later conversion
  - Patched `fetch()` and `XMLHttpRequest` to intercept blob URLs and convert them to data URIs
  - Patched `THREE.FileLoader` to handle blob URL conversion for texture resources
  - Automatic detection of modal viewer context (iframe or Nextcloud viewer) to apply CSP workarounds only when needed
  - All patches are automatically restored after model loading completes
- **CSP Compliance for Buffer Loading**: Fixed CSP violations when loading GLTF files with external `.bin` buffer files
  - Updated `setupResourceManager` to use data URIs for buffers in modal context (instead of blob URLs)
  - Patched `fetch()` to intercept data URI requests and decode them manually, bypassing CSP restrictions
  - Supports both base64 and URL-encoded data URIs for maximum compatibility
- **Animation Support for Multi-File GLTF**: Fixed missing animation initialization for GLTF files loaded with external dependencies
  - Added animation detection and initialization to `loadModelWithFiles` function
  - Animations now properly initialize when loading GLTF files with external `.bin` files
  - Animation controls now appear correctly for animated multi-file GLTF models
- **False Texture Warning**: Removed automatic texture warning banner that was incorrectly showing for all GLB/GLTF files
  - Warning now only appears when actual CSP errors or texture loading failures are detected
  - Improved user experience by eliminating false warnings when textures load successfully
- **Slicer Upload Safety**: Hardened temporary STL upload handling with size and MIME validation
  - Reject uploads over 50 MB per file and enforce a 200 MB rolling temp folder cap
  - Validate STL MIME/header before accepting; reject invalid content
  - Enforce rolling 24h expiration on access and clean up expired shares/files
  - Use rolling +1 day expiration for generated share links
- **OBJ Texture Loading Robustness**: Improved OBJ/MTL parsing and texture handling
  - Preserve texture/MTL paths with spaces and mark materials for update after textures load
  - Use existing blob File objects for texture URLs and tighten loader logging
  - Handle texture load failures gracefully and ensure needsUpdate flags are set
- **Texture Dependency Lookup**: Skip direct “find by path” lookups for image textures to avoid unnecessary 404s; rely on directory listings for textures commonly stored in subfolders

## [2.1.0] - 2025-12-06

### Added
- **File Browser Default View Setting**: Added user preference for default file browser view mode (Grid or List)
  - New setting in Personal Settings → File Browser → Default View
  - FileBrowser component now loads and respects the default view from user settings
  - Setting takes precedence over localStorage, ensuring consistent default behavior
  - Manual view changes are still saved to localStorage for session persistence
- **Format Sync Test Suite**: Created comprehensive unit tests (`tests/unit/Service/FormatSyncTest.php`) to ensure format definitions stay synchronized across:
  - Backend PHP constants (`lib/Constants/SupportedFormats.php`)
  - Frontend configuration (`src/config/viewer-config.js`)
  - Nextcloud MIME registration (`appinfo/mimetypemapping.json`)
- **File Browser List View**: Added ability to toggle between grid and list views in file browser

### Changed
- **Format Definitions Centralized**: Consolidated all 3D model format definitions into `lib/Constants/SupportedFormats.php` as single source of truth
  - `EXT_MIME_MAP` for extension to MIME type mappings
  - `CONTENT_TYPE_MAP` for file streaming content types
  - All repair steps and services now reference centralized constants
  - Eliminates format definition divergence between components
- **File Browser Grid Padding**: Updated file grid padding to consistent 20px on all sides for better visual spacing

### Documentation
- Corrected repository URLs and upstream fork instructions in `CONTRIBUTING.md` (replaced placeholders with `maz1987in/3Dviewer-Nextcloud`).
- Updated `TECHNICAL.md` with new controllers (`SettingsController`, `SlicerController`), components (`PersonalSettings.vue`, `SlicerModal.vue`), and detailed Personal Settings + File Browser implementation sections.
- Added comprehensive "Adding a New Format" guide in `TECHNICAL.md` with step-by-step instructions and code examples
- Expanded `IMPLEMENTATION.md`: added Slicer Integration & Personal Settings System sections; reorganized and deduplicated legacy "Code Audit and Cleanup" content; refreshed Table of Contents.
- Updated `README.md` (docs version) advanced features list to include Slicer Integration and Personal Settings.
- Added troubleshooting sections for Slicer Integration and Personal Settings in `TROUBLESHOOTING.md`.
- Expanded test coverage notes in `TESTING.md` to include new controllers (Settings/Slicer) and components (PersonalSettings/SlicerModal).
- Normalized wording and removed outdated dual-mode duplication in implementation documentation.
- Documented dual-mode viewer architecture in `TECHNICAL.md` with viewer lifecycle diagram (standalone vs modal modes).

### Fixed
- Settings page image/logo path resolution: replaced hardcoded asset URL with `imagePath()` helper in `PersonalSettings.vue` to ensure correct loading under all deployment paths.
- **VRML preprocessing duplication**: Removed duplicate preprocessing code in `preprocessVrmlText()` that was applying BOM removal, line ending normalization, and null byte removal twice, causing inconsistent preprocessing behavior.
- **Flexible texture matching loop control**: Fixed nested loop control flow in texture matching logic (`multiFileHelpers.js`) by adding `foundMatch` flag to properly exit outer loop when match is found in inner loop, preventing valid texture matches from being skipped.
- **Premature texture issue check**: Moved `checkForTextureIssues()` setTimeout call in `ViewerComponent.vue` to execute after model successfully loads and is added to scene, ensuring accurate texture loading status assessment.
- **Debug logging cleanup**: Removed `console.log` statements from `FileBrowser.vue` component (viewMode watcher and setViewMode method) to improve production code quality.

## [2.0.0] - 2025-12-01

### Added
- **Standalone Advanced Viewer**: Full-featured standalone viewer mode accessible via `/apps/threedviewer/f/{fileId}`
  - Dual-mode architecture: simple modal viewer (ViewerComponent) and advanced standalone viewer (App.vue)
  - Conditional mounting in `src/main.js` for `#threedviewer` root element
  - Props-based data flow: `fileId`, `filename`, and `dir` passed via data attributes from template to App.vue
  - Loader-driven model pipeline works in both simple and advanced modes
  - Enhanced error handling with specific messages for 404, 403, network, and parsing errors
  - PageController automatically fetches filename and directory from fileId for robustness
  - User-friendly loading and error states harmonized between both viewer modes
- **Personal Settings**: Added personal settings page for user-specific preferences
  - SettingsController and PersonalSettings view for managing user preferences
  - Settings routes and configuration updates
- **Enhanced File Loaders**: Significantly improved loader capabilities
  - Enhanced FBX loader with additional features and better support
  - Improved VRML loader with expanded capabilities
  - Updated DAE loader for better compatibility
  - Enhanced multi-file loading helpers for improved dependency resolution

### Changed
- **Viewer Enhancements**: Enhanced ThreeViewer component with improved controls and features
- **Camera Improvements**: Updated camera composable with additional functionality
- **Circular Controller**: Enhanced circular controller with better user experience
- **Theme and Performance**: Updated theme and performance composables
- **Major Version Bump**: Version 2.0.0 introduces significant improvements and new features

### Technical
- Updated GitHub workflows with improved condition syntax
- Updated Dependabot timezone to Asia/Muscat
- Added change detection to prevent unnecessary PRs in workflows
- Updated stylelint to 16.26.1

## [1.9.8] - 2025-11-28

### Changed
- **Dependencies**: Updated development and runtime dependencies
  - `three`: ^0.181.1 → ^0.181.2 (patch update)
  - `stylelint`: ^16.25.0 → ^16.26.0 (dev)
  - `vite`: ^7.2.2 → ^7.2.4 (dev)

## [1.9.7] - 2025-11-27

### Added
- **Folder Exclusion**: Added support for `.no3d` marker file to exclude specific folders from 3D file scanning.
- **Hidden Folder Exclusion**: Automatically exclude hidden folders (starting with `.`) from the file index.
- **Temp File Cleanup**: Implemented background job to automatically clean up `.3dviewer_temp` files older than 24 hours.

### Fixed
- **Layout Issue**: Fixed white empty space when hiding the navigation sidebar by ensuring correct flexbox behavior and explicit slot usage.
- **Viewer Resizing**: Fixed 3D canvas visual resizing issue by syncing internal resolution with CSS dimensions (`width: 100%`).
- **App Logo**: Fixed broken app logo in demo scene by using correct asset path helper.
- **Slicer Icons**: Fixed missing slicer icons by using the correct `imagePath` helper for asset URLs.
- **"By Folder" Navigation**: improved folder indexing logic to correctly build hierarchy and handle edge cases.
- **Server Error**: Resolved persistent `preg_match` error in `PreviewManager` by disabling unused app preview provider registration.

## [1.9.6] - 2025-11-21

### Fixed
- **Preview Provider Registration**: Fixed `ArgumentCountError` during app service registration
  - `registerPreviewProvider()` requires 2 arguments (MIME type and provider class)
  - Now registers `ModelPreviewProvider` for each supported MIME type individually
  - Resolves error: "Too few arguments to function registerPreviewProvider(), 1 passed and exactly 2 expected"
- **Migration Class Declaration**: Fixed missing class declaration in migration file
  - Added `class Version010902Date20251116061241 extends SimpleMigrationStep` declaration
  - Resolves syntax error: "unexpected token \"public\", expecting end of file"
- **Folder Path Length**: Removed the 512-character limit by hashing folder paths for indexing
  - Restored `folder_path` to `TEXT` and added a `folder_path_hash` column with a new migration
  - Existing rows are backfilled automatically so deep folder structures continue to work

## [1.9.2] - 2025-11-19

### Added
- **Database-Backed File Indexing**: New `tv_file_index` database table for fast folder, type, date, and favorites navigation
  - Automatic indexing via filesystem event listeners (`NodeCreated`, `NodeWritten`, `NodeDeleted`)
  - Manual reindexing via `php occ threedviewer:index-files [userId]` command or `/apps/threedviewer/api/files/index` endpoint
  - Migration automatically creates the index table on upgrade
- **Smart File Browser**: Complete file navigation system with multiple view modes
  - Viewer mode: Opens 3D viewer by default on app load
  - Folders mode: Hierarchical folder navigation with recursive folder structure
  - Type mode: Browse files grouped by extension (GLB, GLTF, OBJ, etc.)
  - Date mode: Browse files organized by year and month
  - Favorites mode: View all favorited 3D files using Nextcloud system tags
  - Breadcrumb navigation for easy navigation back through folder/type/date hierarchies
  - Consistent card-based UI for folders, types, dates, and files
- **Per-User Configuration**: Remembers user preferences via `ConfigController`
  - Saves preferred sort mode (viewer/folders/type/date/favorites)
  - Remembers last opened file ID for session persistence
- Mobile experience: automatically hides the circular 3D controller when the viewer detects a small/mobile viewport, preventing overlap with the canvas controls.

### Changed
- Viewer opens by default on app load; the file browser now appears only when a user explicitly selects a navigation mode.
- `GET /apps/threedviewer/api/files/list` now serves hierarchical payloads from the database index (folders, types, dates, favorites) instead of scanning filesystem
  - Supports `includeDependencies=1` parameter to return all files including textures and nested subfolders for multi-file model loading
  - Dramatically reduces filesystem scans and improves performance
- Navigation data is loaded lazily per sort mode and cached so switching between viewer and browser modes no longer blocks on loading every file upfront.
- File browser UI refinements:
  - File cards now share the same compact layout as folder cards (consistent padding, thumbnail sizing, fonts, and grid spacing).
  - Type view heading and breadcrumbs no longer show a leading dot (e.g. `GLB` instead of `.GLB`).
  - Breadcrumb component now handles clicks directly via `NcBreadcrumb` to improve reliability.
- Remembered folder/type state is cleared when returning to the root via breadcrumbs to ensure a fresh reload.

### Fixed
- Newly uploaded, edited, or deleted 3D files (and favorites) appear instantly in every navigation mode because the indexing listener reacts to filesystem events instead of relying on manual rescans.
- Root breadcrumb ("Home") navigation restores the folder list correctly, even after drilling into nested folders.
- Multi-file dependency loading:
  - Backend `listFiles` now supports `includeDependencies=1` to return every file (including textures) and nested subfolders.
  - The dependency crawler recursively searches texture subdirectories so 3DS/FBX models with textured assets load successfully.
- Texture search now uses the updated backend response structure to avoid missing files and 404 fetches.

### Technical
- Created `lib/Db/FileIndex.php` and `lib/Db/FileIndexMapper.php` for database operations
- Created `lib/Service/FileIndexService.php` for indexing logic
- Created `lib/Listener/FileIndexListener.php` for automatic index updates
- Created `lib/Command/IndexFiles.php` for manual reindexing command
- Created `lib/Controller/ConfigController.php` for user preference storage
- Created `lib/Migration/Version010902Date20251116061241.php` for database schema migration
- Created `src/components/FileNavigation.vue` and `src/components/FileBrowser.vue` for new navigation UI
- Updated `lib/Controller/FileController.php` with new `listFiles()` and `indexFiles()` endpoints

## [1.9.1] - 2025-11-15

### Added
- **Preview Provider Implementation**: Implemented Nextcloud `IPreviewProvider` interface for 3D model previews
  - Admins can enable/disable via `enabledPreviewProviders` config in `config/config.php`
  - Integrates with Nextcloud's native preview system
  - When enabled, provider is registered and ready for future preview rendering implementation
  - When disabled, Nextcloud automatically uses custom filetype SVG icons

### Changed
- Updated dependencies:
  - `three`: ^0.181.0 → ^0.181.1 (patch update)
  - `@nextcloud/router`: ^3.0.1 → ^3.1.0 (minor update)
  - `vite`: ^7.1.12 → ^7.2.2 (patch update)
  - `@nextcloud/browserslist-config`: ^3.1.1 → ^3.1.2 (patch update)
- Improved duplicate registration prevention:
  - Added guards to prevent duplicate file action registration
  - Added guards to prevent duplicate viewer handler registration
  - Enhanced error handling with try-catch blocks

### Removed
- **ThumbnailController**: Removed custom thumbnail controller endpoint
  - Replaced by proper Nextcloud `IPreviewProvider` implementation
  - No longer needed as Nextcloud handles previews natively
- **Thumbnail Placeholder**: Removed dependency on `thumbnail-placeholder.png`
  - Nextcloud automatically uses custom filetype icons when previews are disabled
  - Custom icons already registered via `mimetypemapping.json`
- **CSS Thumbnail Overrides**: Removed CSS rules that forced `app.svg` background on thumbnails
  - Allows Nextcloud's preview system to work properly
  - Custom filetype icons display correctly when previews are unavailable

### Fixed
- **Duplicate Registration Warnings**: Fixed console warnings about duplicate settings/registrations
  - Added registration guards using window/globalThis flags
  - Improved handler registration checks
  - Better error handling for duplicate registrations

### Technical
- Created `lib/Preview/ModelPreviewProvider.php` implementing `IPreviewProvider`
- Registered preview provider in `Application.php` bootstrap
- Removed `THUMBNAIL` endpoint from constants and API documentation
- Updated `openapi.json` with preview provider documentation

## [1.9.0] - 2025-11-10

### Added
- **🖨️ Slicer Integration**: Send 3D models directly to slicer applications for 3D printing
  - Support for PrusaSlicer, UltiMaker Cura, BambuStudio, OrcaSlicer, Simplify3D, and Eufy Studio
  - One-click export with URL scheme integration
  - Automatic STL conversion and temporary share link creation
  - Professional slicer logos with brand-matched colors
  - Last used slicer appears first for quick access
  - Smart detection of uninstalled slicers with user-friendly error messages
  - Auto-download fallback when slicer app is not registered
  - Temporary file cleanup after 2 minutes
  - Share links expire after 24 hours for security
- **SlicerController API**: Backend controller for handling slicer exports
  - POST `/api/slicer/temp` - Upload STL and create temporary share link
  - GET `/api/slicer/temp/{fileId}` - Download temporary file
  - DELETE `/api/slicer/temp/{fileId}` - Delete temporary file and share
  - Automatic cleanup of old temporary files
  - Proper filename sanitization for paths and special characters
  - CORS headers for slicer application compatibility

### Changed
- Updated app version to 1.9.0
- Enhanced toolbar with "Send to Slicer" button
- Added slicer integration to slide-out tools panel
- Improved error handling with toast notifications
- Updated translations for all supported languages

### Technical
- Created `appinfo/routes.php` for route registration
- Added `@NoCSRFRequired` annotations for API endpoints
- Implemented Nextcloud native share system for temporary URLs
- Fixed filename handling for files with paths and special characters
- Added proper authentication and cleanup mechanisms

## [1.8.0] - 2025-01-05

### Added
- **Screenshot Feature**: Capture high-quality screenshots of 3D models directly from the viewer
  - PNG and JPEG format support with configurable quality
  - Automatic filename generation with timestamp
  - Accessible from toolbar and tools panel
  - Download screenshots directly to local device
  - Fixed WebGL renderer configuration to enable screenshot capture (`preserveDrawingBuffer: true`)
- **Billboard Text Labels**: Annotation and measurement text now always faces the camera
  - Text remains readable from any viewing angle
  - No more reversed/mirrored text when viewing from behind
  - Smooth rotation as camera moves around the model
  - Improved user experience for annotations and measurements

### Changed
- Updated app version to 1.8.0
- Enhanced info.xml with new feature descriptions
- Updated English translations for screenshot and billboard features

## [1.7.13] - 2025-01-05

### Fixed
- **CSP Conflicts**: Removed global CSP listener that was breaking other Nextcloud apps (Memories, etc.)
- **File Icons**: Fixed custom file type icons not displaying by copying them to correct location
- **App Compatibility**: CSP modifications now only apply to 3D viewer routes, allowing other apps to function normally

### Changed
- CSP headers now scoped to specific 3D viewer routes instead of globally
- Added automatic icon copying during build process (scripts/copy-icons.mjs)
- Removed `lib/Listener/CspListener.php` (no longer needed)

## [1.7.12] - 2025-01-04

### Fixed
- **Viewer Integration**: Fixed `files()` method not storing files list, causing "No files provided, skipping update" error
- **File Loading**: Fixed `TypeError: Cannot read properties of undefined (reading 'filename')` when opening 3D files
- **Static Assets**: Fixed 500 error when loading app-color.svg due to route conflicts
- **Route Structure**: Changed viewer route from `/{fileId}` to `/f/{fileId}` to prevent conflicts with static assets
- **Axes Positioning**: Axes helper now positioned at bottom center of models, aligned with grid
- **Axes Scaling**: Made axes size dynamic (25% of model's largest dimension, minimum 5 units)
- **Logo Loading**: Fixed app logo path in demo scene to use generateUrl() for correct URL resolution

### Changed
- Enhanced `files()` method in ViewerComponent with fallback logic to create synthetic file from props
- Simplified PageController by removing unnecessary `is_numeric()` checks
- Updated URL structure for better RESTful design: `/apps/threedviewer/f/{fileId}`
- Axes now recreate on model load to ensure proper sizing and positioning

## [1.7.11] - 2025-01-04

### Fixed
- **Dark Theme Support**: Fixed slide-out toolbar panel not responding to theme changes
- **Theme Switching**: Implemented reactive theme binding using Vue computed properties
- **CSS Integration**: Converted base styles to use Nextcloud CSS variables for better theme integration
- **UI Consistency**: Toolbar panel now properly switches between Light, Dark, and Auto themes

### Changed
- Improved maintainability by using Nextcloud's standard color system throughout the toolbar
- Enhanced theme responsiveness with component-level class binding

## [1.7.10] - 2025-11-04

### Fixed
- **Dark Theme Support**: Fixed slide-out toolbar panel not responding to theme changes
- **Theme Switching**: Implemented reactive theme binding using Vue computed properties
- **CSS Integration**: Converted base styles to use Nextcloud CSS variables for better theme integration
- **UI Consistency**: Toolbar panel now properly switches between Light, Dark, and Auto themes

### Changed
- Improved maintainability by using Nextcloud's standard color system throughout the toolbar
- Enhanced theme responsiveness with component-level class binding

## [1.7.9] - 2025-10-28

### Added
- **3D Camera Controller**: New circular controller interface for intuitive 3D model navigation
- **Camera Control Methods**: Advanced camera manipulation including rotation, zoom, and directional nudging
- **View Snapping**: Animated camera transitions to predefined views (Front, Back, Left, Right, Top, Bottom)
- **Controller Persistence**: Save and restore controller position and visibility preferences
- **Smooth Animations**: Eased camera transitions with customizable duration and easing functions
- **Face Labels**: Orientation markers (TOP, BOTTOM, FRONT, BACK, LEFT, RIGHT) on model faces
- **Export Functionality**: Export models to GLB, STL, and OBJ formats
- **Camera Projection Toggle**: Switch between perspective and orthographic views
- **Progressive Texture Loading**: Background texture loading for improved performance
- **Dependency Caching**: IndexedDB caching system for faster multi-file model loading
- **Model Statistics Panel**: Detailed information about loaded models
- **Help Panel**: Comprehensive in-app documentation and controls guide
- **Theme Customization**: Enhanced theme switching with RTL support
- **Performance Overlay**: Visual performance stats display with real-time monitoring
- **KTX2 Texture Support**: GPU texture compression for better performance

## [1.7.7] - 2025-10-11

### Added
- Comprehensive development tooling and configuration
- Jest testing framework for JavaScript unit tests
- Enhanced GitHub Actions workflows with security scanning
- Improved code quality tools (Stylelint, Psalm enhancements)
- Development documentation and contribution guidelines
- Git hooks for automated code quality checks
- VS Code workspace configuration
- Makefile for common development tasks
- App store marketing materials and screenshots

### Changed
- Enhanced package.json with additional scripts and dependencies
- Improved composer.json with security auditing and additional test configurations
- Updated stylelint configuration with comprehensive CSS/SCSS rules
- Enhanced psalm.xml with better static analysis settings
- Updated app metadata for Nextcloud app store publication

### Security
- Added security scanning workflows (CodeQL, npm audit, composer audit)
- Enhanced dependency vulnerability scanning
- Added security advisories configuration

## [1.0.0] - 2024-01-XX

### Added
- Initial release of 3D Viewer Nextcloud app
- Support for multiple 3D file formats (GLB, GLTF, OBJ, STL, PLY, FBX, 3MF, 3DS)
- Dynamic grid system that adapts to model size
- Model comparison functionality with synchronized controls
- Real-time streaming with authentication
- Performance optimizations with code splitting and dynamic imports
- Theme integration respecting Nextcloud light/dark themes
- Accessibility features with ARIA labels and keyboard navigation
- Bundle size monitoring and optimization
- Comprehensive documentation and user guides
- PHPUnit testing for backend components
- Playwright testing for end-to-end scenarios
- Smoke tests for critical functionality

### Technical Features
- Vue.js 2 + Three.js frontend implementation
- Secure file streaming endpoints
- Dynamic loader imports for format-specific code
- DRACO and KTX2/Basis decoder support (with asset copying)
- Abortable model loading with progress feedback
- Camera state persistence and restoration
- Error handling with user-friendly notifications
- Public share support for anonymous access
- MIME type registration and cleanup
- Centralized model file support logic

### API Endpoints
- `GET /apps/threedviewer/file/{fileId}` - Stream authenticated model files
- `GET /apps/threedviewer/file/{fileId}/mtl/{mtlName}` - Stream MTL files for OBJ models
- `GET /apps/threedviewer/public/file/{token}/{fileId}` - Stream public share model files
- `GET /apps/threedviewer/asset/{type}/{filename}` - Serve static assets
- `GET /apps/threedviewer/decoder/{filename}` - Serve decoder files

### Supported Formats
- **Frontend & Backend**: GLB, GLTF, OBJ (+ MTL), STL, PLY, FBX, 3MF, 3DS
- **Compression**: DRACO (geometry), KTX2/Basis (textures)
- **Materials**: Full MTL support for OBJ files with automatic sibling resolution

### Performance
- Bundle size budget enforcement (950KB main, 120KB chunks)
- Dynamic imports for format-specific loaders
- Code splitting for optimal loading
- Abortable loading for large files
- Progress feedback during model loading

### Testing
- PHPUnit unit tests for controllers and services
- Playwright end-to-end tests
- Smoke tests for critical functionality
- Bundle size monitoring
- Abort behavior testing

### Documentation
- Comprehensive README with technical details
- Installation and user guides
- Developer documentation
- API reference
- Troubleshooting guide
- Technical architecture documentation

---

## Version History

### Development Milestones

- **v0.1.0** - Initial prototype with basic GLTF support
- **v0.5.0** - Added multiple format support and streaming
- **v0.8.0** - Performance optimizations and accessibility features
- **v0.9.0** - Public share support and enhanced error handling
- **v1.0.0** - Production-ready release with comprehensive testing

### Breaking Changes

None in v1.0.0 (initial release)

### Migration Notes

For users upgrading from development versions:

1. **Decoder Assets**: Ensure `draco/` and `basis/` directories are present
2. **MIME Types**: Run the repair step to register missing MIME mappings
3. **Browser Compatibility**: Requires modern browser with WebGL 2.0 support
4. **Nextcloud Version**: Requires Nextcloud 30+ for optimal compatibility

---

## Legend

- **Added** for new features
- **Changed** for changes in existing functionality
- **Deprecated** for soon-to-be removed features
- **Removed** for now removed features
- **Fixed** for any bug fixes
- **Security** for vulnerability fixes

## Links

- [GitHub Repository](https://github.com/your-username/3Dviewer-Nextcloud)
- [Nextcloud App Store](https://apps.nextcloud.com/apps/threedviewer)
- [Documentation](docs/)
- [Issue Tracker](https://github.com/your-username/3Dviewer-Nextcloud/issues)