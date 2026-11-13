<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Notification;

use OCA\ThreeDViewer\AppInfo\Application;
use OCA\ThreeDViewer\Db\Note;
use OCA\ThreeDViewer\Db\NoteMapper;
use OCA\ThreeDViewer\Service\NoteActor;
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
 * @psalm-suppress MissingDependency Nextcloud runtime provides dependent classes in full environment.
 */
class NoteNotificationPublisher
{
    /** The type of the object a notification is about; its id is the first note of the burst */
    public const OBJECT_TYPE = 'threedviewer_note';

    public const SUBJECT_NOTE_ADDED = 'note_added';

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

    public function noteAdded(File $file, Note $note, NoteActor $actor): void
    {
        $recipients = $this->recipients->forNotification($file, $actor);
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
     * A deleted note's notification goes with it, for everyone who has it.
     */
    public function noteDeleted(int $noteId): void
    {
        $this->dismiss($noteId);
    }

    /**
     * The notifications of notes that were removed in bulk, because their model is gone.
     *
     * @param list<int> $noteIds
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
            $notification = $this->notifications->createNotification()
                ->setApp(Application::APP_ID)
                ->setObject(self::OBJECT_TYPE, (string) $noteId);
            $this->notifications->markProcessed($notification);
        } catch (\Throwable $e) {
            $this->logger->warning('3D Viewer could not dismiss the notification of a deleted note', [
                'noteId' => $noteId,
                'exception' => $e,
            ]);
        }
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
