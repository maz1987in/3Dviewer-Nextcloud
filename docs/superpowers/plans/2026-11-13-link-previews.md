# Link Previews Implementation Plan

**Goal:** Links to a model in the viewer show as a card wherever Nextcloud draws link previews, and the Smart Picker can insert one.

**Spec:** `docs/superpowers/specs/2026-11-13-link-previews-design.md`.

**Architecture:**
- `lib/Reference/ModelReferenceProvider.php`: matches viewer links, resolves them for the reader, and names the Smart Picker's search.
- `lib/Search/ModelSearchProvider.php`: finds models by name for the picker; kept out of the search bar.
- `lib/Listener/RenderReferenceListener.php`: adds the card's script and stylesheet where previews are drawn.
- `lib/Listener/ReferenceInvalidationListener.php` and `ThumbnailController::forgetCards`: clear a model's cards when it is written or gets a thumbnail.
- `src/reference.js`, `src/reference/modelCard.js`, `src/reference/registerWidget.js`, `src/css/reference-card.css`: the card, as plain DOM, registered in `@nextcloud/vue`'s widget registry.

## Global constraints

- The card's entry imports nothing but its own modules and CSS; `scripts/check-bundle-size.mjs` gives it a budget of its own.
- Nothing about a file is read for a reader who cannot open it.
- Server strings go through `IL10N`; `l10n/en.json` is synced with `scripts/check-i18n.mjs --sync-en`.

## Tasks

- [x] Reference provider with link matching (index.php, pretty URLs, subfolder, view links, rejected shapes), access checks, description, thumbnail, cache prefix and key. PHPUnit: `tests/unit/Reference/ModelReferenceProviderTest.php`.
- [x] Model search for the Smart Picker. PHPUnit: `tests/unit/Search/ModelSearchProviderTest.php`.
- [x] Listeners and their registration in `Application.php`; thumbnail store clears the cards. PHPUnit: `tests/unit/Listener/RenderReferenceListenerTest.php`, `ReferenceInvalidationListenerTest.php`, `tests/unit/Controller/ThumbnailControllerTest.php`.
- [x] The card and its registration, the `reference` entry in `vite.config.js`. Jest: `tests/unit/modelCard.test.js`, `tests/unit/modelCardRegistration.test.js` (through `@nextcloud/vue`'s own `renderWidget`).
- [x] Review fix: the cache key carries the link, so a view link, the plain link and core's Files card for the same file never share an entry.
- [x] HTTP: `tests/http/ReferenceHttpTest.php` through `/ocs/v2.php/references/resolve` (owner, share recipient, stranger, non-model, Files link beside viewer link, view link beside plain link).
- [x] Real server: `tests/e2e-nextcloud/link-previews.spec.ts` (resolve endpoint, built script and stylesheet served from custom_apps, card drawn).
- [x] Bundle budget, CHANGELOG, README, `l10n/en.json`.
