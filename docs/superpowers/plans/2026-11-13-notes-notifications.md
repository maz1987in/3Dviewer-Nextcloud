# Notes Notifications Implementation Plan

**Goal:** Notify a model's owner and earlier note authors when someone adds a note, collapsed per burst, and record added, changed and deleted notes in the Activity stream of everyone who can open the model.

**Spec:** `docs/superpowers/specs/2026-11-13-notes-notifications-design.md`.

**Architecture:**
- `Service\NoteChangePublisher`: the one thing `NotesController` calls after a note is saved (`added`, `changed`, `deleted`). It decides what is news and contains every failure.
- `Service\NoteRecipients`: who hears: the access list for the stream, owner plus earlier authors with access for notifications.
- `Service\NoteActor`, `Service\NoteLinks`: who did it (user, guest, anonymous) and the viewer's address of a model and of a note.
- `Notification\NoteNotificationPublisher` + `Notification\Notifier` (registered in `Application::register()`).
- `Activity\NoteActivityPublisher` + `Activity\Provider`, `Setting`, `Filter` (declared in `info.xml`).
- `NoteAccessResult` gains the `File` and the reader's path, so the publishers and the notifier need no second lookup.

## Global constraints

- Nothing a note says is stored in a notification or an event: ids, the actor and a count only.
- A failure to announce never fails or undoes the write.
- Nextcloud 31 to 35: `UnknownNotificationException` and `UnknownActivityException` exist from 30.

## Tasks

- [x] `NoteMapper::findRecentByAuthor`, `findAuthorUids`, `findOrphanNoteIds`; `NotesService::find`.
- [x] `NoteActor`, `NoteLinks`, `NoteRecipients`; unit tests.
- [x] `NoteNotificationPublisher` (bursts, dismissal) and `Notifier`; unit tests.
- [x] `NoteActivityPublisher`, `Provider`, `Setting`, `Filter`; unit tests.
- [x] `NoteChangePublisher` wired into `NotesController`; `CleanupOrphanNotes` dismisses; registration.
- [x] `viewLink.js` reads `?note=<id>`; viewers skip the camera for a view without one; Jest.
- [x] Integration tests for the mapper queries; psalm baseline for the new test classes.
- [x] Checked by hand on a Nextcloud 35 container with Notifications and Activity: bell wording, collapsing, previous authors, edits, deletion, trash, the Activity filter. The file's own link stopped the bell line from being a link; removed.
- [x] E2E: `tests/e2e-nextcloud/notes-notifications.spec.ts`; the workflow adds the Notifications and Activity apps and a second account.
- [x] CHANGELOG, README, `docs/TESTING.md`.
