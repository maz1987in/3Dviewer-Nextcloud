<?php

declare(strict_types=1);

/**
 * @copyright Copyright (c) 2025
 * @license AGPL-3.0-or-later
 */

namespace OCA\ThreeDViewer\Listener;

use OCA\Viewer\Event\LoadViewer;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Util;

/**
 * @template-implements IEventListener<LoadViewer>
 */
class LoadViewerListener implements IEventListener
{
    public function handle(Event $event): void
    {
        if (!$event instanceof LoadViewer) {
            return;
        }

        Util::addScript('threedviewer', 'threedviewer-main', 'viewer');
    }
}
