# Embedding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a public link to one 3D file be shown inside another website the Nextcloud admin has listed, with an `<iframe>` code copied from the viewer, while every other Nextcloud page keeps refusing to be framed.

**Architecture:** The embed is two routes. `/apps/threedviewer/embed/{token}` serves a **shell**: the same page for every URL, carrying `frame-ancestors` for the listed origins and nothing about any share. The shell's script reads the token from its own URL and asks `/ocs/.../public/embed/{token}` (a `PublicShareController`, so the share is validated and bad tokens are throttled) whether the share may be embedded. Then it either mounts the light viewer (`ViewerComponent`, pared down) or shows "This model is no longer shared". The split keeps the guard test's rules: a route that takes a token validates the share (Rules A and C), and the shell takes none (Rule B, a reviewed exception). The admin lists origins in a new admin settings section; signed-in users who can share the file copy the code from the tools panel.

**Tech Stack:** Nextcloud app framework (PHP 8.1+, `IAppConfig`, `ContentSecurityPolicy`, `PublicShareController`, settings `ISettings`), Vue 3, `@nextcloud/vue` (`NcSettingsSection`), Jest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-28-views-units-embed-scans-design.md`, section "3. Embedding", plus Goals, Anti-goals and "My calls" (embed code in the tools panel; single-file link shares only; `https` origins plus localhost; with no share, point to the Sharing sidebar and never create one; multi-file models load as on the share page).

## Global Constraints

- Nextcloud 31–35. Only OCP APIs, no private server classes (`tests/unit/NoPrivateServerApiTest.php`).
- Embedding is off until the admin lists a site; empty list = off, which is the default.
- Origins: `https://host[:port]` only, except `http://localhost`, `http://127.0.0.1` and `http://[::1]` with any port, for testing. Stored normalised (lower-case scheme and host, no path, no trailing slash, default port dropped). Nothing else ever reaches the header.
- Only the embed shell's response carries the listed origins in `frame-ancestors`. The app must not widen the policy through `AddContentSecurityPolicyEvent` (`CspListener` keeps only its WebAssembly allowance). Every other page keeps `frame-ancestors 'self'`.
- Eligible share: a link share (`IShare::TYPE_LINK`, not email), of a single supported file, readable, not expired (`ShareFileService::findValidLinkShare`), with no password.
- The app never creates shares.
- Download in the embed only if the share allows downloads (`getHideDownload()` false and no `permissions.download = false` share attribute).
- The embed and everything it calls work without a session or same-site cookie: the shell is `#[PublicPage]`, `#[NoCSRFRequired]`, `#[NoSameSiteCookieRequired]`; the data, file, dependency and file-settings routes are OCS routes, which skip the same-site cookie check.
- Every string through `t('threedviewer', …)` (PHP: `IL10N::t`), British spelling; `npm run i18n:sync` after adding strings.
- Every new control works from the keyboard and is announced, to the tools panel's standard (#234).
- Bundle budgets in `scripts/check-bundle-size.mjs` hold: app chunk 380000 raw / 108000 gzip; the new `embed` entry gets its own budget, at most the `main` entry's.
- Commits: conventional types, no Co-Authored-By trailer; CHANGELOG under `[Unreleased]`; nothing pushed without asking. Never mount the repo into a container. PHP runs in `tdv-php` (unit, psalm, cs, openapi) and `tdv-188-test` (integration, HTTP, live check) on streamed copies, as in the file-units run. Its helper scripts are in the session scratchpad, `php-tools/`: `php-unit.sh`, `php-tool.sh`, `nc-sync.sh`, `nc-test.sh`. New routes need the app re-enabled and Apache reloaded, which `nc-sync.sh` does. `tdv-188-test` answers on `http://localhost:8089`; never write its admin password anywhere. The live check makes its own user with `occ user:add --password-from-env`.

## Review Focus

1. **A share that gains a password, expires or is deleted after its code was pasted.** The frame shows "This model is no longer shared", never a password prompt or the model. Pinned by `PublicEmbedHttpTest::testAShareThatGainedAPasswordIsNoLongerEmbeddable` and `…testADeletedShareIsGone` (Task 3) and the Playwright "gone" case (Task 4).
2. **An origin typed with a path, trailing slash, capitals, a wildcard, plain `http` to a real host, or characters that would end a CSP directive (`;`, a space, a quote).** It is normalised or refused, and never reaches the header raw. Pinned by `EmbedOriginsTest` data cases (Task 1).
3. **Every other page still refuses to be framed:** the share page `/s/{token}` and the viewer page `/apps/threedviewer/f/{id}` keep `frame-ancestors 'self'` while embedding is on. Pinned by `EmbedPageHttpTest::testNoOtherPageMayBeFramed` (Task 3).
4. **A folder share, or a share of an unsupported file, in an embed URL** shows the gone message, and the embed reveals nothing about what is inside. Pinned by `PublicEmbedHttpTest::testAFolderShareIsNotEmbeddable` and `…testAnUnsupportedFileIsNotEmbeddable` (Task 3).
5. **Embedding switched off after embeds were pasted.** The shell answers 404 with no third-party `frame-ancestors`, the data route refuses, and "Copy embed code" disappears. Pinned by `EmbedPageHttpTest::testWithEmbeddingOffTheShellCannotBeFramed` (Task 3) and the Playwright "hidden when off" case (Task 5).

---

### Task 1: Allowed origins — service and admin route

**Files:**
- Create: `lib/Service/EmbedOrigins.php`, `lib/Service/Exception/InvalidEmbedOriginException.php`, `lib/Controller/EmbedAdminController.php`
- Test: `tests/unit/Service/EmbedOriginsTest.php`, `tests/unit/Controller/EmbedAdminControllerTest.php`, `tests/http/EmbedAdminHttpTest.php`, `tests/http/WriteRoutesCsrfHttpTest.php`

**Interfaces:**
- Produces:
  - `EmbedOrigins` (constructor `IAppConfig`): `CONFIG_KEY = 'embed_origins'` (an array value, via `getValueArray`/`setValueArray`); `list(): list<string>`; `isEnabled(): bool` (list non-empty); `static normalize(string $input): ?string`; `save(mixed $origins): list<string>`. `save` takes a list of strings, normalises each, drops duplicates and blank lines, keeps the order given, and stores the result. It throws `InvalidEmbedOriginException` when any entry fails; `getInvalid(): list<string>` lists those entries as typed. `[]` turns embedding off.
  - `PUT /apps/threedviewer/admin/embed-origins` on `EmbedAdminController` (admin only: no `#[NoAdminRequired]`; CSRF checked): body `{origins: string[]}` → 200 `{origins}`; 400 `{error: 'Not a site address', invalid: [...]}`.

- [ ] **Step 1: Write the failing tests**
  - `EmbedOriginsTest::testNormalisesAnOrigin`, with a data provider of `[input, expected]` pairs:
    - `https://Shop.Example.com/` → `https://shop.example.com`
    - `HTTPS://shop.example.com:443` → `https://shop.example.com`
    - `https://shop.example.com:8443` → `https://shop.example.com:8443`
    - `  https://a.example  ` → `https://a.example`
    - `http://localhost:5173` → `http://localhost:5173`
    - `http://127.0.0.1:8080` → `http://127.0.0.1:8080`
    - `http://[::1]:3000` → `http://[::1]:3000`
    - `https://xn--bcher-kva.example` → same
  - `EmbedOriginsTest::testRefusesWhatIsNotAnOrigin`: `normalize` returns null for each of these:
    - wrong scheme or no host: `http://shop.example.com`, `ftp://a.example`, `https://`
    - not an origin: `*`, `https://*.example.com`, `https://a.example/path`, `https://a.example?q=1`, `https://a.example#x`, `https://user@a.example`
    - would break the header: `https://a.example; script-src *`, `https://a .example`, `'self'`, `https://a.example'`
    - not a host: `javascript:alert(1)`, `localhost`, `` (empty)
  - `EmbedOriginsTest::testSaveStoresTheCleanListInOrderWithoutDuplicates`: input `['https://b.example', 'https://A.example/', 'https://b.example', '']` stores `['https://b.example', 'https://a.example']`.
  - `EmbedOriginsTest::testSaveRefusesTheWholeListWhenAnEntryIsBad`: nothing is stored, and `getInvalid()` is `['http://shop.example.com']`.
  - `EmbedOriginsTest::testAnEmptyListTurnsEmbeddingOff`.
  - `EmbedOriginsTest::testSaveRefusesWhatIsNotAListOfStrings`: inputs `'https://a.example'`, `[1]` and `null`.
  - `EmbedAdminControllerTest`:
    - `testTheRouteIsForAdminsOnly`: no `NoAdminRequired`, `NoCSRFRequired` or `PublicPage` attribute on `update`.
    - `testSavesAndReturnsTheList`.
    - `testABadEntryIs400WithTheEntries`.
  - `EmbedAdminHttpTest`:
    - `testAnAdminSavesTheList`.
    - `testAUserWhoIsNotAnAdminCannotSave`: answers 403, the list is unchanged, and `tearDown` restores the stored value.
  - `WriteRoutesCsrfHttpTest::testSavingTheEmbedSitesNeedsTheRequestToken`.
- [ ] **Step 2: Run** the PHP unit suite (`php-unit.sh`), and the HTTP tests after `nc-sync.sh` — Expected: FAIL (classes and route missing).
- [ ] **Step 3: Implement.** For `normalize`:
  - Trim the input, then refuse it unless it matches `^[A-Za-z][A-Za-z0-9+.-]*://[^\s/?#'";,*@]+$` (a trailing `/` is stripped first).
  - Then `parse_url` it. Require scheme `https`, or `http` with host `localhost`, `127.0.0.1` or `[::1]`.
  - Lower-case the scheme and host, and drop `:443` for https and `:80` for http.
- [ ] **Step 4: Run** the same — Expected: PASS; `PublicRouteGuardTest` still passes (the route is not public); psalm and cs clean, the baseline spliced for the new files only, as in file units.
- [ ] **Step 5: Commit** `feat(embed): the sites allowed to embed`

### Task 2: The admin settings section

**Files:**
- Create: `lib/Settings/Admin.php`, `templates/settings-admin.php`, `src/settings-admin.js`, `src/views/AdminSettings.vue`
- Modify: `appinfo/info.xml` (`<admin>OCA\ThreeDViewer\Settings\Admin</admin>`, `<admin-section>OCA\ThreeDViewer\Settings\Section</admin-section>`), `vite.config.*` (entry `'settings-admin': 'src/settings-admin.js'`)
- Test: `tests/unit/Settings/AdminTest.php`, `tests/unit/adminSettings.test.js`

**Interfaces:**
- Consumes: `EmbedOrigins::list()`, the PUT route (Task 1).
- Produces: `Admin::getForm()` provides the initial state `embed-admin` = `{origins: string[]}` and renders `settings-admin`. `Admin::getSection()` returns `'threedviewer'`.
- `AdminSettings.vue`:
  - An `NcSettingsSection` titled `Embedding`, with the description `Show public links to 3D files on other websites, such as a shop or a blog. Only the sites listed here can show them; with none listed, embedding is off.`
  - A `<textarea id="threedviewer-embed-origins">` labelled `Sites allowed to embed`, one origin per line, with the hint `One site per line, such as https://shop.example.com. Only https addresses are accepted, and http://localhost for testing.`
  - A `Save` button.
  - A `role="status"` line: `Saved`, `Embedding is off`, or `Couldn't save the list`.
  - Bad entries are listed in a `role="alert"` block: `Not a site address: {entries}`.
  - A "Web server" paragraph: `If embedded models stay blank, check your web server. The embed page sends frame-ancestors, which browsers obey instead of X-Frame-Options, so the X-Frame-Options header Nextcloud's own setup adds does no harm. A Content-Security-Policy header that your web server adds itself is obeyed as well: remove its frame-ancestors for /apps/threedviewer/embed/.`

- [ ] **Step 1: Write the failing tests**
  - `AdminTest`:
    - `testProvidesTheListAndRendersTheForm`.
    - `testBelongsToTheAppSection`.
  - `adminSettings.test.js` (`mountSfc`-style, for a view: add a `VIEWS` root option to `mountSfc` if needed, and say so in the commit):
    - The textarea shows the stored list, one per line.
    - Save sends `PUT …/admin/embed-origins` with `{ origins: [...] }`, the lines trimmed and blanks dropped.
    - A 400 lists the bad entries in the alert.
    - Saving an empty list announces `Embedding is off`.
    - The textarea has its label and is described by the hint.
- [ ] **Step 2: Run** `php-unit.sh --filter AdminTest` and `npx jest tests/unit/adminSettings.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement**, the Vue component in `PersonalSettings.vue`'s style.
- [ ] **Step 4: Run** the same, `npm run i18n:sync`, `npm run build` — Expected: PASS; the admin page shows the section in `tdv-188-test`, checked once by hand through `nc-sync.sh`, recorded in the ledger.
- [ ] **Step 5: Commit** `feat(embed): admin settings for the sites allowed to embed`

### Task 3: The embed routes — data and shell

**Files:**
- Create: `lib/Service/EmbedService.php`, `lib/Controller/PublicEmbedController.php`, `lib/Controller/EmbedPageController.php`, `templates/embed.php`
- Modify: `lib/Controller/PageController.php` (initial state `embed` = `{enabled: bool}` on `index` and `viewer`), `tests/unit/Controller/PublicRouteGuardTest.php` (`TOKENLESS_PUBLIC_METHODS` entry), `openapi.json` (regenerated), `psalm-baseline.xml` (spliced)
- Test: `tests/unit/Service/EmbedServiceTest.php`, `tests/unit/Controller/PublicEmbedControllerTest.php`, `tests/unit/Controller/EmbedPageControllerTest.php`, `tests/unit/Controller/PageControllerTest.php` (or the file that tests it), `tests/http/PublicEmbedHttpTest.php`, `tests/http/EmbedPageHttpTest.php`

**Interfaces:**
- Consumes: `EmbedOrigins::list()` and `isEnabled()` (Task 1); `ShareFileService::findValidLinkShare`; `ModelFileSupport::isSupported`; `ResponseBuilder::addCspHeaders`.
- Produces:
  - `EmbedService::embeddable(string $token): ?EmbedTarget`.
  - `final class EmbedTarget` (readonly): `IShare $share`, `File $file`, `bool $canDownload`.
  - The answer is null unless all of these hold:
    - embedding is on;
    - `findValidLinkShare` finds the share;
    - its type is `IShare::TYPE_LINK`;
    - its password is empty;
    - its node is a `File` with a supported extension.
  - `GET /ocs/v2.php/apps/threedviewer/public/embed/{token}` on `PublicEmbedController extends PublicShareController`, `#[PublicPage]`, `#[NoCSRFRequired]`, `#[ApiRoute]`:
    - It returns a plain `JSONResponse` `{fileId, filename, mime, shareUrl, downloadUrl}`.
    - `shareUrl` is `linkToRouteAbsolute('files_sharing.Share.showShare', ['token' => …])`.
    - `downloadUrl` is `…'files_sharing.Share.downloadShare'…`, or null when the share hides downloads.
    - Its share methods judge the share: `isValidToken()` is `embeddable($token) !== null` (memoised); the password methods read the share's password.
    - So a token that isn't embeddable, password-protected ones included, is refused and throttled by `PublicShareMiddleware`, as `PublicFileController`'s are.
  - `GET /apps/threedviewer/embed/{token}` on `EmbedPageController extends Controller`, `#[PublicPage]`, `#[NoCSRFRequired]`, `#[NoSameSiteCookieRequired]`, `#[OpenAPI(OpenAPI::SCOPE_IGNORE)]`, `#[FrontpageRoute]`:
    - Its method is `page(): TemplateResponse`. It takes **no** token parameter and reads no share.
    - With embedding on, it returns a `TemplateResponse('threedviewer', 'embed', [], TemplateResponse::RENDER_AS_BASE)` with `addCspHeaders`, and `addAllowedFrameAncestorDomain` for each listed origin.
    - With embedding off, it returns the same template with status 404 and no added ancestors.
    - `templates/embed.php` adds only the `threedviewer-embed` script and the `threedviewer-main` style.
  - `TOKENLESS_PUBLIC_METHODS['EmbedPageController::page']`, with a comment saying it serves the same page for every URL, reads and reveals no share, and frames only for listed sites. The share is checked by `PublicEmbedController`, which the page calls.

- [ ] **Step 1: Write the failing tests**
  - `EmbedServiceTest`, one test per refusal, then one for a share that passes: embedding off; no share; an email share; a password; a folder node; an unsupported file. The passing share gives an `EmbedTarget` with `canDownload` true. Downloads are false with `getHideDownload()`, and false with a `download` attribute of false.
  - `PublicEmbedControllerTest`:
    - It extends `PublicShareController`.
    - `testDescribesAnEmbeddableShare`: exact JSON, with both URLs from a mocked `IURLGenerator`.
    - `testDownloadIsNullWhenTheShareHidesIt`.
    - `testATokenThatIsNotEmbeddableIsInvalid`: `isValidToken()` is false.
  - `EmbedPageControllerTest`:
    - `testFramesOnlyForTheListedSites`: the response's CSP `buildPolicy()` contains `frame-ancestors 'self' https://a.example https://b.example`.
    - `testWithEmbeddingOffItIs404AndAddsNoAncestors`.
    - `testTakesNoTokenAndNeedsNoSession`: reflection shows no parameters, plus the three attributes.
  - `PageController` test: the `embed` initial state is `{enabled: true}` when a site is listed, and false otherwise.
  - `PublicEmbedHttpTest`:
    - `testALinkShareOfAModelIsEmbeddable`;
    - `testAShareThatGainedAPasswordIsNoLongerEmbeddable`, which also checks that no field of the model appears in the body;
    - `testADeletedShareIsGone`;
    - `testAnExpiredShareIsGone` (expiration set in the past through `IManager`);
    - `testAFolderShareIsNotEmbeddable`;
    - `testAnUnsupportedFileIsNotEmbeddable`;
    - `testWithEmbeddingOffNothingIsEmbeddable`;
    - `testWorksWithoutAnyCookie`: Guzzle with no cookie jar, plus one `SameSite=None`-style stray cookie.
    - Each sets the list through `EmbedOrigins::save` and restores it in `tearDown`.
  - `EmbedPageHttpTest`:
    - `testTheShellMayBeFramedByTheListedSites`: the `Content-Security-Policy` header contains `frame-ancestors 'self' https://shop.example`.
    - `testTheShellIsTheSameForEveryToken`: the body for a real token equals the body for `nosuchtoken`, apart from the request token and CSP nonce.
    - `testNoOtherPageMayBeFramed`: `/index.php/s/{token}` and `/index.php/apps/threedviewer/f/{id}` (signed in) carry `frame-ancestors 'self'` and not `shop.example`.
    - `testWithEmbeddingOffTheShellCannotBeFramed`: 404, and no `shop.example`.
- [ ] **Step 2: Run** `php-unit.sh`, then `nc-sync.sh` and `nc-test.sh http` — Expected: FAIL.
- [ ] **Step 3: Implement** the Interfaces. Regenerate `openapi.json`; run cs and psalm, and splice the baseline for the new files only.
- [ ] **Step 4: Run** the same — Expected: PASS; `PublicRouteGuardTest` passes with the one new reviewed entry.
- [ ] **Step 5: Commit** `feat(embed): the embed page and the share it shows`

### Task 4: The embedded viewer

**Files:**
- Create: `src/embed.js`, `src/utils/publicViewer.js`, `src/utils/embedTarget.js`
- Modify: `src/main.js` (mode 1b mounts through `mountPublicViewer`), `src/composables/usePublicShare.js` (`setPublicShareContext`), `src/views/ViewerComponent.vue` (embed mode), `vite.config.*` (entry `embed`), `scripts/check-bundle-size.mjs` (budget for `threedviewer-embed`), `scripts/sync-icon-paths.mjs` + `src/config/icon-paths.js` (`fullscreen`, `fullscreenExit`, `download` from mdi, via `npm run icons:sync`), `tests/playwright/helpers/viewerServer.ts` (`embed` page)
- Test: `tests/unit/utils/embedTarget.test.js`, `src/composables/__tests__/usePublicShare.spec.js`, `tests/playwright/embed.spec.ts`

**Interfaces:**
- Consumes: the data route (Task 3).
- Produces:
  - `embedTokenFromPath(pathname: string): ?string` — the segment after `/embed/`, only if it matches `^[A-Za-z0-9_-]{1,64}$`.
  - `loadEmbedTarget(token): Promise<?{fileId, filename, mime, shareUrl, downloadUrl}>` — null on any failure or on a response missing `fileId` or `filename`.
  - `setPublicShareContext(ctx)` in `usePublicShare.js`: sets what `getPublicShareContext()` returns. Embed pages use it; nothing else does.
  - `mountPublicViewer(container: HTMLElement, share): void` in `src/utils/publicViewer.js`: what `main.js` mode 1b does now, moved there unchanged.
  - `src/embed.js`:
    - Token, then target. With none, `#content` gets a `<p class="threedviewer-embed-gone" role="status">` saying `This model is no longer shared`.
    - Otherwise it calls `setPublicShareContext({ token, fileId, isSingleFile: true, filename, mime, embed: { shareUrl, downloadUrl } })`, then `mountPublicViewer`.
  - `ViewerComponent` embed mode (`getPublicShareContext()?.embed`):
    - The root fills the frame.
    - Screenshot, Model info and Copy link to this view are hidden.
    - It shows a `Full screen` / `Exit full screen` button (`fullscreen`/`fullscreenExit` icons), only when `document.fullscreenEnabled`; `aria-pressed` follows `document.fullscreenElement`.
    - It shows a `Download` link (`download` icon, `target="_blank" rel="noopener noreferrer"`), only when `downloadUrl`.
    - It shows a small text link `Open in Nextcloud` to `shareUrl` (same `rel`, `target="_blank"`).
    - A `?view=` in the embed URL sets the camera as on a share page.
  - Harness `Viewer.embed?: { shareUrl: string, downloadUrl: string | null } | 'gone'`. It serves the shell (`#content`, script `threedviewer-embed.mjs`) at `/index.php/apps/threedviewer/embed/{token}` and answers the data route.

- [ ] **Step 1: Write the failing tests**
  - `embedTarget.test.js`:
    - The token from `/index.php/apps/threedviewer/embed/AbC123_-x`, and from the path without `index.php`.
    - null for `/embed/`, for `/embed/a b`, for a 65-character token, and for `/s/abc`.
    - `loadEmbedTarget` calls the OCS URL with `OCS-APIRequest`, and gives null on a 404 or a partial body.
  - `usePublicShare.spec.js`: `setPublicShareContext` is what `getPublicShareContext` returns afterwards.
  - `embed.spec.ts`:
    - `the embed shows the model with only its own controls`: a canvas; buttons `Full screen`, `Download` and the `Open in Nextcloud` link with the share URL; no `Screenshot`, `Model info` or `Copy link to this view`; no page errors.
    - `no download when the share hides it`.
    - `a gone share says so`: the `role="status"` text `This model is no longer shared` and no canvas.
    - `a view in the embed code sets the camera`: the model-relative camera matches the link, read as in `view-links.spec.ts`.
    - `full screen from the keyboard`: focus, Enter → `aria-pressed="true"`.
- [ ] **Step 2: Run** `npx jest tests/unit/utils/embedTarget.test.js src/composables/__tests__/usePublicShare.spec.js`, then `npm run build && npx playwright test tests/playwright/embed.spec.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**; `npm run icons:sync`; `npm run i18n:sync`.
- [ ] **Step 4: Run** the same, then the full Jest and Playwright suites, so that `view-links.spec.ts`'s light-viewer cases confirm mode 1b still mounts — Expected: PASS; the build within budgets.
- [ ] **Step 5: Commit** `feat(embed): the embedded viewer`

### Task 5: "Copy embed code" in the viewer

**Files:**
- Create: `src/utils/embedCode.js`, `src/components/EmbedCodeControl.vue`, `src/utils/initialState.js`
- Modify: `src/utils/linkShares.js` (`isFile`, `canRead`, `embeddableShares`), `src/utils/davFiles.js` (`canShare`), `src/components/SlideOutToolPanel.vue` (the control after "Copy public link to this view"), `src/App.vue` (embed state, `canShareModel`, `onCopyEmbedCode`), `tests/playwright/helpers/viewerServer.ts` (`embedEnabled`, `shares`, `canShare` options)
- Test: `tests/unit/utils/embedCode.test.js`, `tests/unit/utils/linkShares.test.js`, `tests/unit/utils/davFiles.test.js` (or its existing file), `tests/unit/embedCodeControl.test.js`, `tests/playwright/embed-code.spec.ts`

**Interfaces:**
- Consumes: `listLinkShares`/`pickableShares`, App's `publicShares` and `loadPublicShares` (view links); `buildViewUrl`, `getViewState` (view links); `copyLink` (App).
- Produces:
  - `readInitialState(key: string): ?any`: reads `#initial-state-threedviewer-{key}` as `usePublicShare` does, and gives null on anything malformed. `usePublicShare` keeps its own reader.
  - `LinkShare` gains `isFile: boolean` (`item_type === 'file'`) and `canRead: boolean` (`permissions & 1`).
  - `embeddableShares(shares: LinkShare[]): LinkShare[]`: `isFile && canRead && !hasPassword`, after `pickableShares`.
  - `canShare(userId, path): Promise<boolean>`: `oc:permissions` includes `R`; false on any error.
  - `embedUrl(origin: string, token: string, view: ?object): string`: `origin + generateUrl('/apps/threedviewer/embed/{token}')`, with `?view=` from `buildViewUrl` when `view` is given.
  - `buildEmbedCode({ url, width, height, title }): string`, exactly:
    ```
    <iframe src="{url}" width="{width}" height="{height}" title="{title}" style="border: 0" allow="fullscreen" allowfullscreen loading="lazy"></iframe>
    ```
    Every value is HTML-attribute-escaped (`&`, `"`, `<`, `>`). Width and height are whole numbers clamped to 200–4000.
  - `EmbedCodeControl.vue`:
    - Props `shares` (embeddable), `fileId`; emits `copy` with `{ shareId, width, height, includeView }`.
    - A `Copy embed code` button with `aria-expanded` and `aria-controls="embed-code-options"` opens the options.
    - When several shares are embeddable, the options start with a `Public link` select listing `label · date`, as the public-link picker does.
    - `Width` and `Height` number inputs (defaults 640 and 480), a `Show the model from this angle` checkbox (on by default) and a `Copy` button.
    - With no embeddable share: `Embedding needs a public link to this file without a password.` and a link `Open the Sharing sidebar` to `generateUrl('/apps/files/files/{fileId}') + '?opendetails=true'`.
    - Escape closes the options and returns focus to the opener, as `public-link-choices` does.
  - The tools panel shows the control only when signed in, `embed.enabled`, the model is loaded, and `canShareModel`. `canShareModel` is read with the shares when the panel opens.
  - App's `onCopyEmbedCode` copies `buildEmbedCode(...)` with the toast `Embed code copied. Paste it into the page that shows the model.`, and the model's filename as `title`.

- [ ] **Step 1: Write the failing tests**
  - `embedCode.test.js`:
    - The exact snippet for a plain URL.
    - Escaping of a `"` and `<` in the title.
    - Clamping of 50 and 99999.
    - `embedUrl` with and without a view; the view's `camera` is all it carries.
  - `linkShares.test.js`:
    - The new fields.
    - `embeddableShares` drops a password share, a folder share and an upload-only share.
  - `davFiles` test: `canShare` is true for `RGDNVW`, false for `GD`, false on an error.
  - `embedCodeControl.test.js`:
    - One share: no select, and `copy` is emitted with the defaults.
    - Several shares: the select is present and the chosen id is emitted.
    - No shares: the message and the sidebar link with the file id.
    - Escape closes the options and refocuses the opener.
    - The inputs are labelled.
  - `embed-code.spec.ts`:
    - `copies an iframe for the one public link, from this angle`: the clipboard text matches the snippet with `/embed/{token}?view=1.`.
    - `several links: choose one`.
    - `no link without a password: points to the Sharing sidebar`.
    - `hidden when embedding is off`.
    - `hidden for someone who can't share the file`.
    - `hidden on a public page`.
- [ ] **Step 2: Run** the Jest files, then `npm run build && npx playwright test tests/playwright/embed-code.spec.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same, `npm run i18n:sync`, lint, stylelint, the full Jest and Playwright suites — Expected: PASS; the app chunk within 380000 raw / 108000 gzip.
- [ ] **Step 5: Commit** `feat(embed): copy embed code from the viewer`

### Task 6: Proof in real browsers, and docs

**Files:**
- Create: `scripts/live-embed-check.mjs`
- Modify: `docs/TECHNICAL.md` (an "Embedding" section and TOC entry), `CHANGELOG.md` (`[Unreleased]` Added), `src/views/AdminSettings.vue` (only if the check says the web-server paragraph is wrong)

**Interfaces:**
- `scripts/live-embed-check.mjs`:
  - Env `TDV_BASE`, `TDV_USER`, `TDV_PASSWORD`; it never prints the password.
  - It uploads `tests/fixtures/textured.obj` with its `textured.mtl` and `checker.png` through WebDAV and makes a link share of the OBJ through OCS, so a multi-file model is what gets embedded: the spec wants it to load as it does on the share page. It expects `http://127.0.0.1:5555` among the listed sites, and exits saying how to list it if not.
  - It serves on `127.0.0.1:5555` a page with two iframes: the embed URL and the share page `/index.php/s/{token}`. `127.0.0.1` is a different site from `localhost`, so the frames are cross-site, cookies included.
  - It drives Chromium and Firefox (Playwright).
  - It reports for each: the embed frame shows a canvas; the share-page frame is refused; the response headers seen, `X-Frame-Options` and CSP.
  - It exits non-zero on any failure.

- [ ] **Step 1: Run** the check against Apache (`TDV_BASE=http://localhost:8089`, the `.htaccess` that sets `X-Frame-Options "SAMEORIGIN"`) — Expected: the embed loads in both browsers, the share page is refused in both.
- [ ] **Step 2: Run** it again behind nginx: an `nginx:alpine` container on `:8090`, configured by `docker cp` (no mounts), `proxy_pass` to `tdv-188-test` with `add_header X-Frame-Options "SAMEORIGIN" always;` as Nextcloud's nginx guide sets it, and `localhost:8090` in `trusted_domains` — Expected: the same. Then a second nginx run that also adds `add_header Content-Security-Policy "frame-ancestors 'self'" always;` — Expected: the embed is refused, which is the case the admin paragraph warns about. Record the three results, and the headers, in the ledger.
- [ ] **Step 3: Write** the docs: TECHNICAL.md "Embedding", covering the shell/data split and why, the origin rules, the CSP, cookies, the guard test's reviewed entry, and the three results above. CHANGELOG `[Unreleased]` Added: embedding public links in sites the admin lists.
- [ ] **Step 4: Run** `npm run i18n:check`, `npm run build`, the full Jest, Playwright, PHP unit, integration and HTTP suites — Expected: all pass.
- [ ] **Step 5: Commit** `docs: describe embedding` (with `scripts/live-embed-check.mjs`)
