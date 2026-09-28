# Shared annotations and measurements

**Status:** design approved in conversation, awaiting spec review
**Date:** 2026-09-28

## Problem

Annotations are saved, but privately: `AnnotationsService` keeps one JSON document per user per file in app data (`annotations/<userId>/…`). Someone the model is shared with sees none of them, and public-link visitors can't load them at all. Measurements are not saved anywhere and vanish on reload.

For a model under review, the notes are the point of sharing it. They should travel with the model to everyone who can open it.

## Goals

- One shared set of annotations and measurements per model, visible to everyone who can open the model, including visitors on a public link.
- Anyone who can edit the model can add, change and delete notes; everyone else sees them read-only.
- Two people editing at once never overwrite each other's notes.
- Each user's existing private annotations carry over without loss.

## Non-goals

- Live updates while the model is open. Others' changes appear the next time the model is opened.
- Comments or replies on notes, and per-note colours.
- Editing from public links, even links that allow editing.
- A sidecar file beside the model. It was rejected because a single-file share can't reach it, saving would need permission to create files in the folder, and it wouldn't follow the model through moves or renames.

## Decisions

| Question | Decision |
|---|---|
| Audience | Everyone with access to the model |
| Storage | Server-side table keyed by the model's file ID |
| Public links | View only |
| Concurrency | One row per note; each add, edit or delete touches a single note |
| Who may edit a note | Anyone who can edit the model, whoever authored the note |
| Live updates | No |

## Storage

New table `threedviewer_notes`, created by a migration in `lib/Migration`. The entity and mapper live in `lib/Db` (`Note`, `NoteMapper`) and follow `FileIndex` and `FileIndexMapper`.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint, auto-increment | |
| `file_id` | bigint, indexed | The model's Nextcloud file ID; unchanged by moves and renames |
| `type` | string(16) | `annotation` or `measurement` |
| `payload` | text | JSON; see below |
| `author_uid` | string(64) | |
| `created_at`, `updated_at` | bigint | Unix seconds |

### Payload

Both types store points relative to the model (`modelRoot`), not the scene. Today's world-space points line up only because the load-time placement in `ThreeViewer.vue` is repeatable; model-relative points survive changes to that placement.

- Annotation: `{ "space": "model", "point": {x,y,z}, "text": string }`
- Measurement: `{ "space": "model", "points": [{x,y,z}, {x,y,z}] }`

A measurement stores only its two points. The distance is recalculated on load, and the unit stays a per-viewer display preference.

`space` is `"model"` for every new note. Migrated legacy annotations carry `"scene"` until they are converted, as described under Legacy migration.

### Validation (`NotesService`)

- Annotation text at most 2,000 characters, and the whole stored payload at most 10 KB of JSON. The byte cap is set above what 2,000 characters can need, so emoji, CJK text and quotes are never rejected by it; 4 KB, the figure first agreed, would have rejected about 1,000 emoji.
- Coordinates must be finite numbers.
- Unknown keys are rejected, and `type` must match the payload shape.
- At most 1,000 notes per model.

## Access

Access is worked out on every request from the model file itself, never from the note.

- **Signed-in users:** look up `getUserFolder($uid)->getById($fileId)`.
  - No node found returns **404**, so the response doesn't reveal that the file exists.
  - Otherwise the user can read, and `canEdit` is true if any node found is updateable (`isUpdateable()`). One file can be visible at more than one path.
- **Public links:** access goes through a controller that extends `PublicShareController`. That is where Nextcloud enforces share passwords, expiry and brute-force protection; the same approach fixed GHSA-gjh8-x4wm-3cfj. `ShareFileService::getFileFromShare()` confirms the file ID belongs to the share. Public links are always read-only, and author fields are left out of public responses so user names aren't shown to anonymous visitors.
- **CSRF:** every signed-in route requires Nextcloud's request token, including `GET`. None carries `#[NoCSRFRequired]`, unlike the current annotation routes. `GET` needs the token as well because it runs the legacy migration, which publishes a user's private annotations to everyone who can open the model; a forged cross-site request must not be able to set that off. The read-only public route keeps `#[NoCSRFRequired]`, the way `PublicFileController` does.

## API

Signed-in routes are attribute routes on a new `NotesController`:

| Method | Route | Body | Result |
|---|---|---|---|
| GET | `/api/notes/{fileId}` | — | `{ canEdit, notes: Note[], private: Note[] }` |
| POST | `/api/notes/{fileId}` | `{ type, payload }` | `201` with the new note; `403` if the user can't edit |
| PATCH | `/api/notes/{fileId}/{noteId}` | `{ payload }` | The updated note; `404` if the note isn't on that file |
| DELETE | `/api/notes/{fileId}/{noteId}` | — | `204` |

The public route, on OCS, is `GET /public/notes/{token}/{fileId}` and returns `{ canEdit: false, notes }` without author fields.

A `Note` in a response is `{ id, type, payload, author: { uid, displayName } | null, createdAt, updatedAt }`. A deleted author shows as `null`.

## Legacy migration

This runs inside `GET /api/notes/{fileId}` whenever the caller still has a legacy document for that file.

- **Caller can edit the model:** each legacy annotation is inserted as a shared note, authored by the caller, with `space: "scene"`. The legacy document is then deleted, inside one transaction, so each note moves exactly once.
- **Caller can't edit the model:** the shared set is left alone, and the legacy document stays where it is. Its annotations are returned in `private`, and the viewer shows them to that user only, labelled "Private, not shared".

`AnnotationsController` and the legacy routes are removed. The legacy storage is then reached only through this migration path.

When the viewer sees a note with `space: "scene"`, it converts the point with `modelRoot.worldToLocal()`. If `canEdit` is true, it saves the converted payload back once with `PATCH`.

Two tabs opening the same model at once must not migrate twice. The migration takes an exclusive lock on the user and file, and re-reads the legacy document once it holds the lock; a request that can't get the lock skips the migration.

## Viewer behaviour

A new composable, `useSharedNotes`, owns all traffic to the server. `useAnnotation` and `useMeasurement` keep drawing and editing, and report changes to `useSharedNotes` instead of saving themselves. The whole-document autosave in `ThreeViewer.vue` is removed.

- **Load:** after the model loads, the viewer fetches its notes (from the public route on a share page) and draws them. Comparison mode is skipped, as today.
- **Add:** the note is drawn straight away and saved with `POST`. When the server answers, its ID replaces the temporary one. If the save fails, the note is marked unsaved, its entry in the panel shows Retry and Discard buttons, and a toast says it wasn't saved. The buttons sit in the panel rather than the toast because the app's toasts can't hold actions.
- **Edit text:** saved per note with `PATCH`, 600 ms after typing stops.
- **Delete:** `DELETE` for that one note. "Clear all" asks for confirmation first, because it deletes the notes for everyone.
- **Read-only** (`canEdit` false):
  - Adding an annotation is disabled, with a tooltip saying the model is view-only.
  - Measuring still works, but the new measurements are labelled "Not saved" and aren't sent to the server.
- **Authors:** the annotation and measurement panels show each note's author. The labels in 3D are unchanged.
- **JSON import and export:** export includes measurements. Import adds the notes as new shared notes when the user can edit, and as local unsaved notes otherwise.

## Cleanup

A daily background job deletes notes whose `file_id` no longer has a row in `filecache`. Trashed files keep their row, so a model restored from the trash keeps its notes.

## Testing

**PHP unit:**
- `NotesService` validation: size caps, keys, types, non-finite numbers, the per-model limit.
- Working out read access and `canEdit` from mocked nodes, including a file visible at more than one path.

**PHP integration,** in the existing SQLite, MySQL and Postgres CI matrix, sending real requests through Nextcloud's middleware:
- Each of these is refused:
  - a read-only share recipient writing (`403`);
  - a user who can't see the file (`404`);
  - a write without the CSRF token;
  - a password-protected public link opened without its password;
  - any write through a public link.
- Migration moves a legacy document exactly once for an editor, and leaves it alone for a read-only user.
- `NoteMapper` queries work on all three databases.

**Jest (`useSharedNotes`):**
- An add is drawn immediately; a failed save offers Retry or Discard.
- Text edits save once, after typing stops.
- Points survive the round trip to model-relative form and back, and `scene`-space points are converted.

**Playwright,** against a mocked server:
- Shared notes appear on load.
- Read-only mode disables adding annotations and labels new measurements as unsaved.

## Rollout

- A CHANGELOG entry under `[Unreleased]`.
- Nextcloud runs the migration when the next release raises the app version in `appinfo/info.xml`.
- No admin setting and no feature flag.
