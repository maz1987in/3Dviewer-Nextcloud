<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Listener;

use OCA\ThreeDViewer\Service\ThumbnailService;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Files\Events\Node\NodeDeletedEvent;
use OCP\Files\Events\Node\NodeWrittenEvent;
use OCP\Files\File;
use Psr\Log\LoggerInterface;

/**
 * Drops a file's stored thumbnails when its content changes or the file is deleted.
 *
 * Nextcloud clears its own preview cache on write; this keeps the app's store consistent
 * with that. A write needs nothing more than deleting everything: the event fires before
 * any client can see the new ETag, and thumbnails are keyed by ETag anyway.
 *
 * @template-implements IEventListener<Event>
 */
class ThumbnailInvalidationListener implements IEventListener
{
    public function __construct(
        private readonly ThumbnailService $thumbnails,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function handle(Event $event): void
    {
        if (!($event instanceof NodeWrittenEvent || $event instanceof NodeDeletedEvent)) {
            return;
        }

        $node = $event->getNode();
        if (!$node instanceof File) {
            return;
        }

        $fileId = $node->getId();
        if ($fileId === null) {
            return;
        }

        // Never let cleanup break the write or delete that triggered it. Two deletes can
        // race, and the app data may be unwritable; stale thumbnails are harmless because
        // they are keyed by ETag.
        try {
            $this->thumbnails->deleteAll($fileId);
        } catch (\Throwable $e) {
            $this->logger->warning('ThumbnailInvalidationListener: Could not delete thumbnails', [
                'fileId' => $fileId,
                'exception' => $e,
            ]);
        }
    }
}
