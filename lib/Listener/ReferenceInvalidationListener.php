<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Listener;

use OCA\ThreeDViewer\Constants\SupportedFormats;
use OCA\ThreeDViewer\Reference\ModelReferenceProvider;
use OCP\Collaboration\Reference\IReferenceManager;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Files\Events\Node\NodeWrittenEvent;
use OCP\Files\File;
use Psr\Log\LoggerInterface;

/**
 * Drops the cached cards of a model's links when its content changes.
 *
 * Nextcloud keeps a resolved link for an hour. Core clears it when a file is deleted,
 * renamed or shared, but not when it is rewritten, so a card would go on showing the old
 * size and the old thumbnail. Cards are cached under the file id (see
 * ModelReferenceProvider::cachePrefixFor), so one call drops every reader's.
 *
 * @template-implements IEventListener<Event>
 */
class ReferenceInvalidationListener implements IEventListener
{
    /** @psalm-suppress PossiblyUnusedMethod Constructed by the DI container */
    public function __construct(
        private readonly IReferenceManager $references,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function handle(Event $event): void
    {
        if (!$event instanceof NodeWrittenEvent) {
            return;
        }

        // This runs on every write on the instance, so anything but a model is left at once,
        // and nothing here may be the reason a write fails.
        $fileId = null;

        try {
            $node = $event->getNode();
            if (!$node instanceof File || !in_array(strtolower($node->getExtension()), SupportedFormats::getModelExtensions(), true)) {
                return;
            }

            $fileId = $node->getId();
            $this->references->invalidateCache(ModelReferenceProvider::cachePrefixFor($fileId));
        } catch (\Throwable $e) {
            // At worst a card is an hour out of date.
            $this->logger->warning('ReferenceInvalidationListener: Could not clear the cached cards', [
                'fileId' => $fileId,
                'exception' => $e,
            ]);
        }
    }
}
