<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCA\ThreeDViewer\Activity\NoteActivityPublisher;
use OCA\ThreeDViewer\Activity\Provider;
use OCA\ThreeDViewer\Db\Note;
use OCA\ThreeDViewer\Db\NoteReply;
use OCA\ThreeDViewer\Notification\NoteNotificationPublisher;
use OCP\Files\File;
use Psr\Log\LoggerInterface;

/**
 * Lets everyone who cares know that a model's notes changed: the Activity stream for all
 * who can open the model, a notification for those with a stake in its notes, and one for
 * anyone a note or a reply mentions.
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
        private readonly NoteMentions $mentions,
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

        // Whoever the text mentions is told that, and only that: the mention is the more
        // specific news, and a second notification for the same note would be noise
        $mentioned = $this->mentionedIn(NotePayload::textOf($note->getPayload()), true);

        $this->guard(fn () => $this->activity->publish(Provider::NOTE_ADDED, $file, $actor, $note->getId()));
        $this->guard(fn () => $this->notifications->noteAdded($file, $note, $actor, $mentioned));
        if ($mentioned !== []) {
            $this->guard(fn () => $this->notifications->mentioned($file, $note, $actor, $mentioned));
        }
    }

    /**
     * @param Note $note the note as saved
     * @param int $previousUpdatedAt when the note was last touched before this change
     * @param string $previousText the note's text before this change, so only a person this
     *     change adds is told they were mentioned
     */
    public function changed(?File $file, Note $note, NoteActor $actor, int $previousUpdatedAt, string $previousText = ''): void
    {
        if ($file === null) {
            return;
        }

        // The text of a note is saved as it is typed, and a person may be named in it at any
        // of those saves. A mention is news however quietly the text was edited, so this
        // comes before the check below.
        $added = array_values(array_diff(
            $this->mentionedIn(NotePayload::textOf($note->getPayload()), true),
            $this->mentionedIn($previousText, true),
        ));
        if ($added !== []) {
            $this->guard(fn () => $this->notifications->mentioned($file, $note, $actor, $added));
        }

        if ($note->getAuthorUid() === $actor->authorKey() && $note->getUpdatedAt() - $previousUpdatedAt <= self::QUIET_EDIT_SECONDS) {
            return;
        }

        $this->guard(fn () => $this->activity->publish(Provider::NOTE_CHANGED, $file, $actor, $note->getId()));
    }

    /**
     * A note was resolved, or opened again. Only the stream hears of it: it is the record
     * of what happened to the model, and nobody is asked to do anything.
     */
    public function stateChanged(?File $file, Note $note, NoteActor $actor): void
    {
        if ($file === null) {
            return;
        }

        $subject = $note->getState() === Note::STATE_RESOLVED ? Provider::NOTE_RESOLVED : Provider::NOTE_REOPENED;
        $this->guard(fn () => $this->activity->publish($subject, $file, $actor, $note->getId()));
    }

    /**
     * A reply was written. The stream hears of it; people the reply mentions are notified.
     * The note's own author is not, unless named: replies are announced to the stream, and
     * a notification asks for someone's attention only when someone asks for it.
     */
    public function replied(?File $file, Note $note, NoteReply $reply, NoteActor $actor): void
    {
        if ($file === null) {
            return;
        }

        $mentioned = $this->mentionedIn($reply->getText(), false);

        $this->guard(fn () => $this->activity->publish(Provider::NOTE_REPLIED, $file, $actor, $note->getId()));
        if ($mentioned !== []) {
            $this->guard(fn () => $this->notifications->mentioned($file, $note, $actor, $mentioned));
        }
    }

    /**
     * A reply was edited: whoever the edit newly names is told, and nobody else.
     */
    public function replyChanged(?File $file, Note $note, NoteReply $reply, NoteActor $actor, string $previousText): void
    {
        if ($file === null) {
            return;
        }

        $added = array_values(array_diff($this->mentionedIn($reply->getText(), false), $this->mentionedIn($previousText, false)));
        if ($added !== []) {
            $this->guard(fn () => $this->notifications->mentioned($file, $note, $actor, $added));
        }
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

    /**
     * The accounts a text mentions. A failure to read them costs the mention, not the change.
     *
     * @return list<string>
     */
    private function mentionedIn(string $text, bool $settledOnly): array
    {
        try {
            return $this->mentions->uids($text, $settledOnly);
        } catch (\Throwable $e) {
            $this->logger->warning('3D Viewer could not read the mentions in a note', ['exception' => $e]);

            return [];
        }
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
