<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCA\ThreeDViewer\Activity\NoteActivityPublisher;
use OCA\ThreeDViewer\Activity\Provider;
use OCA\ThreeDViewer\Db\Note;
use OCA\ThreeDViewer\Notification\NoteNotificationPublisher;
use OCP\Files\File;
use Psr\Log\LoggerInterface;

/**
 * Lets everyone who cares know that a model's notes changed: the Activity stream for all
 * who can open the model, a notification for those with a stake in its notes.
 *
 * It runs after the change has been saved, and nothing that goes wrong here may undo or
 * fail it: a note that was written stays written even if the news of it cannot be sent.
 * Failures are logged and dropped.
 *
 * @psalm-suppress MissingDependency Nextcloud runtime provides dependent classes in full environment.
 */
class NoteChangePublisher
{
    /**
     * A note's author who keeps editing it — typing the text of a note they have just put
     * down, in saves a second apart — is working on it, not changing it again. An edit this
     * soon after the note was last touched, by its author, is left out of the stream.
     */
    public const QUIET_EDIT_SECONDS = 600;

    /** @psalm-suppress PossiblyUnusedMethod Constructed by the DI container */
    public function __construct(
        private readonly NoteActivityPublisher $activity,
        private readonly NoteNotificationPublisher $notifications,
        private readonly LoggerInterface $logger,
    ) {
    }

    /**
     * @param ?File $file the model; without one there is nobody to tell
     */
    public function added(?File $file, Note $note, NoteActor $actor): void
    {
        if ($file === null) {
            return;
        }

        $this->guard(fn () => $this->activity->publish(Provider::NOTE_ADDED, $file, $actor, $note->getId()));
        $this->guard(fn () => $this->notifications->noteAdded($file, $note, $actor));
    }

    /**
     * @param Note $note the note as saved
     * @param int $previousUpdatedAt when the note was last touched before this change
     */
    public function changed(?File $file, Note $note, NoteActor $actor, int $previousUpdatedAt): void
    {
        if ($file === null) {
            return;
        }
        if ($note->getAuthorUid() === $actor->authorKey() && $note->getUpdatedAt() - $previousUpdatedAt <= self::QUIET_EDIT_SECONDS) {
            return;
        }

        $this->guard(fn () => $this->activity->publish(Provider::NOTE_CHANGED, $file, $actor, $note->getId()));
    }

    public function deleted(?File $file, int $noteId, NoteActor $actor): void
    {
        $this->guard(fn () => $this->notifications->noteDeleted($noteId));
        if ($file === null) {
            return;
        }

        // The note is gone, so the entry links to the model alone
        $this->guard(fn () => $this->activity->publish(Provider::NOTE_DELETED, $file, $actor, null));
    }

    private function guard(callable $send): void
    {
        try {
            $send();
        } catch (\Throwable $e) {
            $this->logger->warning('3D Viewer could not announce a change to a note', ['exception' => $e]);
        }
    }
}
