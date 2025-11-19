<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Listener;

use OCA\ThreeDViewer\Service\FileIndexService;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Files\Events\Node\NodeCreatedEvent;
use OCP\Files\Events\Node\NodeDeletedEvent;
use OCP\Files\Events\Node\NodeWrittenEvent;
use OCP\Files\File;
use OCP\IUserSession;

/**
 * @template-implements IEventListener<Event>
 */
class FileIndexListener implements IEventListener
{
	public function __construct(
		private readonly FileIndexService $fileIndexService,
		private readonly IUserSession $userSession,
		private readonly ModelFileSupport $modelFileSupport,
	) {
	}

	public function handle(Event $event): void
	{
		$user = $this->userSession->getUser();
		if ($user === null) {
			return;
		}
		$userId = $user->getUID();

		if ($event instanceof NodeCreatedEvent || $event instanceof NodeWrittenEvent) {
			$node = $event->getNode();
			if ($node instanceof File) {
				$extension = strtolower($node->getExtension());
				if ($this->modelFileSupport->isSupported($extension)) {
					$this->fileIndexService->indexFile($node, $userId);
				}
			}
		} elseif ($event instanceof NodeDeletedEvent) {
			$node = $event->getNode();
			if ($node instanceof File) {
				$this->fileIndexService->removeFile($node->getId(), $userId);
			}
		}
	}
}

