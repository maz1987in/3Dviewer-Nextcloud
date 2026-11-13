# Browser tests against a real Nextcloud: plan

Design: `docs/superpowers/specs/2026-11-13-e2e-real-nextcloud-design.md`.

1. **Fixtures.** `tests/fixtures/cube.step` is a 10 mm cube written as AP214 B-rep (6 KB), checked to decode with `occt-import-js` to one mesh of 12 triangles. `shapes.3dm` and `triangle.stl` already exist.
2. **Config and helpers.** `tests/e2e-nextcloud/playwright.config.ts` (one worker, software WebGL, reduced tracing), `env.ts` (server address, models, state file), `helpers.ts` (the guard, the loaded assertions). The root `playwright.config.ts` ignores the directory; `package.json` gets `test:e2e:nextcloud`.
3. **Setup.** `global-setup.ts` uploads the models over WebDAV, reads their file ids, makes public links for the STL and the STEP file, and signs in once.
4. **Specs.** `models.spec.ts`: each model from the Files app and on the app's own page, and the navigation icon. `public-share.spec.ts`: the STL and the STEP file as a visitor with no session.
5. **Workflow.** `.github/workflows/test-e2e-nextcloud.yml`: version matrix, server and Viewer checkout, build, package into `custom_apps/`, install, check where the app is, serve, run, upload the report on failure.
6. **Proof that it catches the bug class.** Reintroduce a hard-coded `/apps/threedviewer/` WASM path on a throwaway commit; the STEP tests must fail. Recorded in the pull request.
7. **Docs.** A section in `docs/TESTING.md`.
