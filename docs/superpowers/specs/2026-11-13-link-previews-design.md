# Link previews for models

**Status:** built on autopilot; decisions recorded here, no review conversation
**Date:** 2026-11-13

## Why

A link to a model pasted into Talk, Text, Collectives, Deck or Mail shows as a bare URL. Nextcloud has a framework for turning links into cards (reference providers, the reference widget registry and the Smart Picker), and core's own Files provider already does it for Files links. The viewer's own links, which "Copy link to this view" and the viewer's address bar give people, get nothing.

## Goals

- A link to a model in the viewer (`/apps/threedviewer/f/{fileId}`, with or without `index.php`, on a server in a subfolder, with a saved view's `?view=` or anything else after the id) shows as a card: the model's thumbnail, its name, its format and size, and an "Open in 3D Viewer" button. A view link's card says it opens at a shared view, and its button opens that view.
- "3D models" in the Smart Picker: find a model by name and insert its viewer link.
- What a card shows is decided per reader. Someone who cannot open the file sees the bare link, with nothing in it to tell "no such file" from "not yours".
- The card costs the pages that show it next to nothing: no three.js, no Vue, no l10n library.

## Non-goals

- Cards on public pages (a public Text or Collectives share). See "Follow-ups".
- A 3D view inside the card. The card is a picture and a button; the viewer opens in its own tab.

## Decisions

| Question | Decision |
|---|---|
| Which links are claimed | The app's viewer links only. Nextcloud gives a link to the first provider that matches it and never falls through, so claiming Files links (`/f/{id}`) would mean answering for every file, not only models, and replacing core's Files card, which already shows a model's name and stored thumbnail. Rejected: claiming `/f/{id}` for model files only. Deciding that needs a file lookup in `matchReference`, which core calls for every link in every message, for every provider. |
| What matches | The path decides: the absolute URL of the viewer route (`getAbsoluteURL`, so the web root of a subfolder install is in it), with and without `index.php`, then a plain positive id, then nothing or a query or fragment. `/f/12/extra`, `/f/012` and a trailing slash are not the route and are not claimed. Matching is a string comparison, with no lookup. |
| Who sees what | The id is looked up in the reader's own user folder (their files and what is shared with them). A folder, an unreadable file, a file that is not a model format and a reader who is not signed in all resolve to null, before anything about the file is read. |
| Caching | Core caches a resolved link for an hour under `md5(prefix)-md5(key)`. The prefix is the file id, as core's Files provider uses, so what core clears on delete, rename and share clears these cards too. The key is the reader's user id plus the link. The user id keeps one reader's card from another; the link keeps a view link's card apart from the plain link's, and keeps the card apart from core's Files card, whose key is the user id alone under the same prefix (found in review: without the link in the key, whichever was asked first was what both links got). |
| Keeping cards current | `ReferenceInvalidationListener` clears a model's cards when it is written, which core does not; `ThumbnailController` clears them when a thumbnail is stored, so a card made before the model had one gains it. |
| Thumbnail | Nextcloud's preview of the file (`core.Preview.getPreviewByFileId`, 640x360), but only once the viewer has stored a thumbnail for that version. Before then the preview is a file-type icon, and the card draws a cube of its own instead. |
| Description | Format and size, and the unit someone set for a file that records none. |
| The card | A plain-DOM widget in its own entry (`src/reference.js` → `js/threedviewer-reference.mjs`, 2.9 KB raw / 1.3 KB gzip), loaded by a `RenderReferenceEvent` listener with its stylesheet. Text, Talk, Collectives and Deck fire that event on the pages that draw previews. The host page runs whichever Vue its app was built with, so the card brings none. |
| Registering it | Directly into `window._vue_richtext_widgets`, which is all `@nextcloud/vue`'s `registerWidget` does. Importing that function pulls the reference picker's chunk into the entry (about 570 KB). Every copy of the library reads the same registry at render time, and a Jest test renders the card through the real `renderWidget`. |
| The card's styles | Its own stylesheet, only the rules the card uses, on Nextcloud's variables (`--color-main-background`, `--color-border`, `--border-radius-large`, `--color-primary-element` and so on), with fallbacks for servers that predate one. It follows the host page's light, dark and high-contrast themes without the app's tokens. It first imported the app's design system, 13.1 KB raw / 2.8 KB gzip on every page that can show a preview; now 2.2 KB / 0.8 KB, with a CSS budget of 3000 / 1200 B that counts the entry and everything it imports. |
| Wording on the card | The two phrases come from the server in the rich object, translated for the reader, so the entry does not carry the l10n library (34 KB) to look up two strings. |
| Untrusted data | The card sets names and descriptions as text, and uses a link or image address only if it is http(s). |
| Smart Picker | The reference provider is discoverable and searchable, naming `ModelSearchProvider`, which searches the reader's file tree by name and keeps model files they can read, newest first, paged by cursor. Its result link is the viewer link, which is what the picker inserts. Rejected: the app's file index, which only holds files indexed since install or the last re-index. |
| Search bar | The model search is not listed in Nextcloud's search bar (`getOrder` returns null; the picker asks it by id all the same). Files already finds models by name there, and a second full search on every keystroke would cost every user to show the same files twice. |
| Bundle budget | Budgets of its own for the script, 4500 B raw / 2000 B gzip, so pulling in Vue, l10n or three.js fails the build, and for the stylesheet (above). No other budget changes. |

## Follow-ups

- **Public share links (`/s/{token}`).** Not done. `IPublicReferenceProvider` resolves on public pages with the page's share token, and the safe version must check the token's password session and that the linked file is inside that share. That is a second access model to get right, with its own tests, for a smaller audience (readers of a public Text or Collectives page).
- A card for Files links to models with a "3D" button, if core ever lets a provider decline a match.
- A Text/Talk end-to-end test. The real-server suite has neither app installed; it checks the resolve endpoint and the built card on the Files page instead.
