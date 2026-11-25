<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Listener;

use OCA\ThreeDViewer\Constants\SupportedFormats;
use OCA\ThreeDViewer\Service\ModelStatsService;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Files\Events\Node\NodeDeletedEvent;
use OCP\Files\Events\Node\NodeWrittenEvent;
use OCP\Files\File;
use Psr\Log\LoggerInterface;

/**
 * Drops a model's stored statistics when its content changes or the file is deleted.
 *
 * The numbers are keyed by ETag, so a stale row is never shown for a newer version; this
 * keeps the table from holding what nobody can read. The event fires before any client can
 * see the new ETag.
 *
 * @template-implements IEventListener<Event>
 */
class ModelStatsInvalidationListener implements IEventListener
{
    /** @psalm-suppress PossiblyUnusedMethod Constructed by the DI container */
    public function __construct(
        private readonly ModelStatsService $stats,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function handle(Event $event): void
    {
        if (!($event instanceof NodeWrittenEvent || $event instanceof NodeDeletedEvent)) {
            return;
        }

        // Never let cleanup break the write or delete that triggered it, so every node
        // access is in here too: a node already gone can throw from getId().
        $fileId = null;

        try {
            $node = $event->getNode();
            if (!$node instanceof File) {
                return;
            }

            // Only model files have statistics; every other write and delete on the
            // instance ends here without touching the database.
            if (!in_array(strtolower($node->getExtension()), SupportedFormats::getThumbnailExtensions(), true)) {
                return;
            }

            $fileId = $node->getId();
            $this->stats->delete($fileId);
        } catch (\Throwable $e) {
            $this->logger->warning('ModelStatsInvalidationListener: Could not delete statistics', [
                'fileId' => $fileId,
                'exception' => $e,
            ]);
        }
    }
}
