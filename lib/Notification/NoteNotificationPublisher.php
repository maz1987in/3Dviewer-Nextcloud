<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Notification;

use OCA\ThreeDViewer\AppInfo\Application;
use OCA\ThreeDViewer\Db\Note;
use OCA\ThreeDViewer\Db\NoteMapper;
use OCA\ThreeDViewer\Service\NoteActor;
use OCA\ThreeDViewer\Service\NoteMentions;
use OCA\ThreeDViewer\Service\NoteRecipients;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\Files\File;
use OCP\Notification\IManager;
use OCP\Notification\INotification;
use Psr\Log\LoggerInterface;

/**
 * Tells the people with a stake in a model that someone added a note to it.
 *
 * One person adding a run of notes — ten measurements, say — must not leave ten
 * notifications. Notes by the same person on the same model, each within COLLAPSE_SECONDS
 * of the one before, are a burst; a burst has one notification per recipient, and each new
 * note in it replaces that notification with one that counts the burst so far, so the
 * count goes up instead of the list growing. The burst is worked out from the notes
 * themselves, so nothing else is stored: the notification is keyed by the id of the
 * burst's first note, and that key is the same for every note that joins it.
 *
 * A note more than COLLAPSE_SECONDS after the last starts a burst of its own, and a
 * notification of its own.
 *
 * A mention is told apart from that: "someone mentioned you in a note" goes to the person
 * named, about that note, whatever else is going on. Neither kind carries the note's text.
 *
 * @psalm-suppress MissingDependency Nextcloud runtime provides dependent classes in full environment.
 */
class NoteNotificationPublisher
{
    /** The type of the object a notification is about; its id is the first note of the burst */
    public const OBJECT_TYPE = 'threedviewer_note';

    /** The type of the object a mention is about; its id is the note, so a person has one per note */
    public const MENTION_OBJECT_TYPE = 'threedviewer_note_mention';

    public const SUBJECT_NOTE_ADDED = 'note_added';

    public const SUBJECT_NOTE_MENTION = 'note_mention';

    /** The longest quiet gap inside one burst of notes */
    public const COLLAPSE_SECONDS = 600;

    /** How far back to look for the rest of a burst; a longer one counts as this many */
    public const BURST_LOOKBACK = 100;

    /** @psalm-suppress PossiblyUnusedMethod Constructed by the DI container */
    public function __construct(
        private readonly IManager $notifications,
        private readonly NoteRecipients $recipients,
        private readonly NoteMapper $mapper,
        private readonly ITimeFactory $time,
        private readonly LoggerInterface $logger,
    ) {
    }

    /**
     * @param list<string> $except people who are being told about this note some other way —
     *     a mention names someone more precisely than "a note was added", so whoever is
     *     mentioned gets that notification alone
     */
    public function noteAdded(File $file, Note $note, NoteActor $actor, array $except = []): void
    {
        $recipients = array_values(array_diff($this->recipients->forNotification($file, $actor), $except));
        if ($recipients === []) {
            return;
        }

        [$firstNoteId, $count] = $this->burst($note, $actor);

        foreach ($recipients as $uid) {
            // One recipient whose notification can't be written must not cost the others theirs
            try {
                // The burst's earlier notification, if any, gives way to this one
                $this->notifications->markProcessed($this->forBurst($uid, $firstNoteId));

                $notification = $this->forBurst($uid, $firstNoteId)
                    ->setDateTime($this->time->getDateTime())
                    ->setSubject(self::SUBJECT_NOTE_ADDED, $actor->toParameters() + [
                        'fileId' => $file->getId(),
                        'noteId' => $note->getId(),
                        'count' => $count,
                    ]);
                $this->notifications->notify($notification);
            } catch (\Throwable $e) {
                $this->logger->warning('3D Viewer could not send a notification about a note', [
                    'fileId' => $file->getId(),
                    'exception' => $e,
                ]);
            }
        }
    }

    /**
     * Tell the people a text mentions, who can open the model, that they were. Whoever
     * can't open it is not told, and neither is the writer.
     *
     * A person has one such notification per note: mentioned again in the same thread, the
     * earlier one gives way to the new one rather than the list growing.
     *
     * @param list<string> $uids the accounts the text mentions
     */
    public function mentioned(File $file, Note $note, NoteActor $actor, array $uids): void
    {
        $recipients = array_slice($this->recipients->forMention($file, $actor, $uids), 0, NoteMentions::MAX_NOTIFIED);

        foreach ($recipients as $uid) {
            // One recipient whose notification can't be written must not cost the others theirs
            try {
                $this->notifications->markProcessed($this->forMention($uid, $note->getId()));

                $notification = $this->forMention($uid, $note->getId())
                    ->setDateTime($this->time->getDateTime())
                    ->setSubject(self::SUBJECT_NOTE_MENTION, $actor->toParameters() + [
                        'fileId' => $file->getId(),
                        'noteId' => $note->getId(),
                    ]);
                $this->notifications->notify($notification);
            } catch (\Throwable $e) {
                $this->logger->warning('3D Viewer could not send a notification about a mention', [
                    'fileId' => $file->getId(),
                    'exception' => $e,
                ]);
            }
        }
    }

    /**
     * A deleted note's notifications go with it, for everyone who has them.
     */
    public function noteDeleted(int $noteId): void
    {
        $this->dismiss($noteId);
    }

    /**
     * The notifications of notes that were removed in bulk, because their model is gone.
     *
     * @param int[] $noteIds
     */
    public function notesDeleted(array $noteIds): void
    {
        foreach ($noteIds as $noteId) {
            $this->dismiss($noteId);
        }
    }

    private function dismiss(int $noteId): void
    {
        try {
            foreach ([self::OBJECT_TYPE, self::MENTION_OBJECT_TYPE] as $type) {
                $notification = $this->notifications->createNotification()
                    ->setApp(Application::APP_ID)
                    ->setObject($type, (string) $noteId);
                $this->notifications->markProcessed($notification);
            }
        } catch (\Throwable $e) {
            $this->logger->warning('3D Viewer could not dismiss the notification of a deleted note', [
                'noteId' => $noteId,
                'exception' => $e,
            ]);
        }
    }

    private function forMention(string $uid, int $noteId): INotification
    {
        return $this->notifications->createNotification()
            ->setApp(Application::APP_ID)
            ->setUser($uid)
            ->setObject(self::MENTION_OBJECT_TYPE, (string) $noteId);
    }

    private function forBurst(string $uid, int $firstNoteId): INotification
    {
        return $this->notifications->createNotification()
            ->setApp(Application::APP_ID)
            ->setUser($uid)
            ->setObject(self::OBJECT_TYPE, (string) $firstNoteId);
    }

    /**
     * The burst a note belongs to: the id of its first note, and how many notes it holds
     * as of this one.
     *
     * @return array{0: int, 1: int}
     */
    private function burst(Note $note, NoteActor $actor): array
    {
        $firstNoteId = $note->getId();
        $count = 1;
        $later = $note->getCreatedAt();

        foreach ($this->mapper->findRecentByAuthor($note->getFileId(), $actor->authorKey(), self::BURST_LOOKBACK) as $earlier) {
            if ($earlier->getId() >= $note->getId()) {
                continue;
            }
            if ($later - $earlier->getCreatedAt() > self::COLLAPSE_SECONDS) {
                break;
            }
            $firstNoteId = $earlier->getId();
            $count++;
            $later = $earlier->getCreatedAt();
        }

        return [$firstNoteId, $count];
    }
}
