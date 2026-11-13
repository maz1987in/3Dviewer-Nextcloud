# Notifications and Activity for shared notes

**Status:** built on autopilot; decisions recorded here, no review conversation
**Date:** 2026-11-13

## Why

Shared notes (`2026-09-28-shared-notes-design.md`) are silent. Someone marks a hole on a bracket, and the bracket's owner only finds out by opening the model. Nextcloud has two channels for this, and the app used neither: the bell (Notifications) for "someone wants your attention", and the Activity stream for "what happened to this file".

## Goals

- A notification to the model's owner and to everyone who has written a note on it, when someone else adds a note. Its link opens the model with that note in focus.
- A run of notes by one person on one model is one notification that counts them, not ten.
- An Activity entry, for everyone who can open the model, when a note is added, changed or deleted, under a filter of the app's own and on the file's Activity tab.
- A setting under Settings › Notifications to turn the stream entries off, or email on.
- Nobody who cannot open the model learns anything about it, and no notification or stream entry carries what a note says.

## Non-goals

- Notifications for changed or deleted notes: the stream records them; the bell is for new things.
- Mentions (`@sara`) inside a note.
- Per-model muting.

## Decisions

| Question | Decision |
|---|---|
| Who is notified | The file's owner and every earlier note author, minus the author of the new note, minus anyone `NoteAccess` no longer lets open the file (checked per recipient, because an author from last month may have lost the share). Read-only recipients who never wrote a note are not notified: they have no stake in the notes, and the stream already tells them. |
| Who gets stream entries | Everyone on the file's access list, from `IShareHelper::getPathsForAccessList()`, the same source `files_sharing` uses for its own events, each with the path they see the file at. Past 500 users (a file shared with a whole organisation) the entry goes only to the owner and the note authors. |
| Files filter or our own | Our own `Filter` ("3D Viewer"). An app cannot add itself to the Files filter's app list. Events are filed against the file (`object_type` `files`), which is what also puts them on the file's Activity tab in the Files sidebar. |
| Collapsing a burst | No extra table. Notes by the same author on the same file, each within 10 minutes of the one before, are a burst, worked out from the notes themselves (`findRecentByAuthor`, newest 100). The notification's object id is the burst's first note, so every note that joins finds the same notification: it is marked processed and sent again with the new count and a link to the newest note. The Notifications app has no "update" call, and this is how Talk replaces its own. |
| Edits in the stream | An edit by the note's own author within 10 minutes of the note's last change is left out: that is someone typing the text of a note they have just placed, which the viewer saves as they go. Anyone else's edit, or a later one, is recorded. |
| Wording | Built at read time by `Notifier` and `Provider` in the reader's language, from the stored actor, file id, note id and count. Only those are stored, so a note's text can't reach a subject, an email or a push message, and a translation applies to old entries. The notes API has a `private` list (pre-3.6 annotations not yet migrated); those are never created through the API, so they never announce anything. |
| The note link | `/apps/threedviewer/f/{fileId}?note={noteId}`. The server cannot build a full view link (`?view=`), which needs a camera, so `viewLink.js` also reads a bare `note` parameter as a view with a note and no camera: the viewer frames the model as usual and focuses the note. Nextcloud's file access decides who gets in. |
| The bell's click target | The file in the notification carries no link of its own. The Notifications app makes the whole line a link to the notification's link only when no object in it has one; with a file link, a click on the line did nothing and a click on the name opened the model without the note. Found in a real Nextcloud 35. |
| A file deleted, or a share removed | `Notifier::prepare()` asks `NoteAccess` for the reader each time and throws `AlreadyProcessedException` when they can no longer open the file, which removes the notification. `CleanupOrphanNotes` also dismisses the notifications of the notes it deletes. |
| A note deleted | Notifications whose object is that note are dismissed for everyone: all single-note notifications, and a burst whose first note it was. A deleted later note of a burst leaves the burst's notification, whose link then opens the model without a note to focus. Re-keying the burst on deletion was rejected as complexity for a rare case. |
| Activity's own notifications | `canChangeNotification()` is false. The app sends its own, collapsed and to the right people; the Activity app's would come on top. Stream on and email off by default. |
| Public links (guests) | Public links are read-only (shared-notes spec: "Editing from public links" is a non-goal), so no guest can add a note today. The actor model is ready for it: `NoteActor` has guests and anonymous visitors, their names are cleaned of control and bidirectional characters, cut to 64 characters, shown as a `highlight` rich object (never a `user`) with "(guest)" in the sentence, and filed under a `guest:` key that is never notified. Opening public writing is its own change, with its own security review. |
| Failures | Publishing runs after the note is saved and can never fail the request: every channel, and every recipient, is in its own try/catch that logs a warning. |

## Testing

- PHPUnit: `Notifier` (subjects for one and several notes, users, guests, anonymous visitors, rich objects, link, unknown app or subject → `UnknownNotificationException`, lost access and unreadable parameters → `AlreadyProcessedException`), `NoteNotificationPublisher` (bursts, gaps, lookback, dismissal), `Provider`, `NoteActivityPublisher`, `Setting`/`Filter`, `NoteRecipients` (author excluded, no-access excluded, owner and previous authors included, guests never notified, the 500 cap), `NoteActor`, `NoteChangePublisher` (quiet edits, failures contained), and `NotesController` calling the publisher.
- Integration (SQLite, MySQL, Postgres): the three new `NoteMapper` queries.
- E2E on a real Nextcloud with the Notifications and Activity apps: a second account adds two notes to a model shared with it through the API; the owner has one notification counting both, with no note text, two stream entries under the app's filter, and the bell's line opens the model with the newer note in focus.
