<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\FileAction;

use OCA\Files\Event\LoadSidebar;
use OCA\Files\Event\LoadViewer;
use OCP\AppFramework\Services\IInitialState;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Files\File;
use OCP\Files\Node;
use OCP\IURLGenerator;
use OCP\Util;

/**
 * Files app integration for 3D viewer
 */
class View3DAction implements IEventListener {
	private IURLGenerator $urlGenerator;
	private IInitialState $initialState;

	public function __construct(IURLGenerator $urlGenerator, IInitialState $initialState) {
		$this->urlGenerator = $urlGenerator;
		$this->initialState = $initialState;
	}

	public function handle(Event $event): void {
		if ($event instanceof LoadSidebar || $event instanceof LoadViewer) {
			// Load our Files integration script
			Util::addScript('threedviewer', 'threedviewer-files');
			Util::addStyle('threedviewer', 'threedviewer-filesIntegration');
		}
	}
}
