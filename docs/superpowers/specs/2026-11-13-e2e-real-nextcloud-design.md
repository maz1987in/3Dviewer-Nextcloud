# Browser tests against a real Nextcloud

**Status:** agreed; built without a design discussion, decisions recorded here
**Date:** 2026-11-13

## Why

Four bugs reached users because nothing ran the built frontend inside a real Nextcloud:

- #169: STEP failed on Nextcloud 34 because the bundled runtime needed CSP `unsafe-eval`.
- #188: STEP/IGES/BREP/FCSTD, IFC and 3DM never opened on App Store installs. The WASM URLs were hard-coded to `/apps/threedviewer/…`, and an App Store install lives in `custom_apps/`.
- #204: 3DM never finished loading. rhino3dm used `new Function`, which the CSP blocks.
- #211: the navigation icon `/apps/threedviewer/img/app.svg` returned 404 on `custom_apps` installs.

The Playwright suite serves the built bundle from a static page with a fake `OCA`, so it sees neither the server's CSP nor the install path. The PHP integration workflow runs a real server but installs the app under `apps/` and never loads the frontend.

## Goals

- Open models in a browser against a real server with the app in `custom_apps/threedviewer`, built from the branch and packaged as `release.yml` packages it.
- Fail on a CSP violation and on a 404 for one of the app's own files.
- Fail when a hard-coded `/apps/threedviewer/` path comes back.

## Non-goals

- A matrix over server versions or databases. `test-integration.yml` owns those axes; one browser job on the newest supported server is enough to see these failures.
- Covering every format or every tool. The suite is a probe for install-path and CSP faults: one format that needs nothing (STL), one that needs the OCCT decoder (STEP), one that needs rhino3dm (3DM).
- Visual comparison of what is rendered.

## Decisions

| Question | Decision | Rejected |
|---|---|---|
| Workflow shape | A workflow of its own, `test-e2e-nextcloud.yml` | A job in `test-integration.yml`: that file fans out over versions and databases and has no Node, browser or build |
| Server | `nextcloud/server` checked out at the newest branch `info.xml` supports, SQLite, `php -S` with 4 workers | A release tarball (its branch may not exist before release); Docker image (a second way to install than the integration workflow uses) |
| Viewer app | `nextcloud/viewer` checked out at the same branch into `apps/viewer` | Skipping it: the Files app opens nothing without it, and the Files path is the one users take |
| Where the app lives | `custom_apps/`, set up through `config/apps.config.php` as the official Docker image does, with `appstoreenabled=false` | `apps/threedviewer`: the hard-coded URLs would resolve and the suite would pass while meaning nothing. A step checks `occ app:getpath` to keep it honest |
| What is installed | The release package: `npm ci`, `npm run build`, `composer install --no-dev --optimize-autoloader`, then `release.yml`'s `rsync` exclusions | The working tree: it would include `tests/` and source maps, which users do not get |
| Location of specs | `tests/e2e-nextcloud/` with its own config; the root config gets `testIgnore` | Putting them under `tests/playwright/`: the root config would run them with no server |
| Addressing | Through `index.php` | Pretty URLs: `php -S` applies no `.htaccess`, and `/apps/files/` is a real directory there, so it answers 404 |
| What counts as loaded | In the light viewer: the controls that only exist after a load, and a model-info panel that reports faces. On the app's own page: `window.__LOAD_COMPLETE` | The page showing a canvas: a canvas is there while a load is still running or has failed |
| The guard | Every test fails on a `securitypolicyviolation` event or a console/worker-console message about the policy, and on a 4xx/5xx or failed request for a URL under `/custom_apps/threedviewer/` or `/apps/threedviewer/` | Asserting on outcome alone: a loader that swallows its error shows only a timeout |
| Tracing | Network, console and actions; no DOM snapshots, no screencast | Full tracing: both read the WebGL canvas back and stalled the first model load for over a minute on a software renderer |
| Background thumbnails | Off for the test user, through the app's own setting | On: the Files page renders each model's thumbnail in WebGL, and with SwiftShader that stalled the first model a test opened for a minute, failing the test at random |

## What it showed

With the hard-coded `/apps/threedviewer/occt/` path put back into `src/loaders/occt-runtime.js`, the STEP tests failed on all three surfaces (Files app, the app's page, a public link) with `404 for the app file /apps/threedviewer/occt/occt-import-js.wasm` and the loader's `Aborted(both async and sync fetching of the wasm failed)`. The STL and 3DM tests, whose paths were untouched, still passed.
