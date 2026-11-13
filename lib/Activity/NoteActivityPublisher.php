<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Activity;

use OCA\ThreeDViewer\AppInfo\Application;
use OCA\ThreeDViewer\Service\NoteActor;
use OCA\ThreeDViewer\Service\NoteLinks;
use OCA\ThreeDViewer\Service\NoteRecipients;
use OCP\Activity\IManager;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\Files\File;
use Psr\Log\LoggerInterface;

/**
 * Puts "someone added, changed or deleted a note on this model" into the Activity stream
 * of everyone who can open the model.
 *
 * The event is filed against the file itself (object type `files`), which is what puts it
 * on the file's own Activity tab in the Files sidebar as well as in the main stream.
 * Nothing of the note is stored but its id: no text, no coordinates.
 *
 * @psalm-suppress MissingDependency Nextcloud runtime provides dependent classes in full environment.
 */
class NoteActivityPublisher
{
    /** @psalm-suppress PossiblyUnusedMethod Constructed by the DI container */
    public function __construct(
        private readonly IManager $activity,
        private readonly NoteRecipients $recipients,
        private readonly NoteLinks $links,
        private readonly ITimeFactory $time,
        private readonly LoggerInterface $logger,
    ) {
    }

    /**
     * @param string $subject one of the Provider::NOTE_* subjects
     * @param ?int $noteId the note, when there is still one a link can open
     */
    public function publish(string $subject, File $file, NoteActor $actor, ?int $noteId): void
    {
        $fileId = $file->getId();
        $link = $noteId === null ? $this->links->forFile($fileId) : $this->links->forNote($fileId, $noteId);
        $timestamp = $this->time->getTime();

        foreach ($this->recipients->forStream($file) as $uid => $path) {
            // One reader whose entry can't be written must not cost the others theirs
            try {
                $event = $this->activity->generateEvent();
                $event->setApp(Application::APP_ID)
                    ->setType(Setting::TYPE)
                    ->setAffectedUser((string) $uid)
                    ->setAuthor($actor->activityAuthor())
                    ->setTimestamp($timestamp)
                    ->setSubject($subject, $actor->toParameters() + ['fileId' => $fileId, 'path' => $path])
                    ->setObject('files', $fileId, $path)
                    ->setLink($link);
                $this->activity->publish($event);
            } catch (\Throwable $e) {
                $this->logger->warning('3D Viewer could not publish an activity event for a note', [
                    'fileId' => $fileId,
                    'exception' => $e,
                ]);
            }
        }
    }
}
