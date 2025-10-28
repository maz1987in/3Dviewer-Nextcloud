<?php

declare(strict_types=1);

/**
 * Listener for Files app - loads our viewer handler script
 * This ensures our 3D model viewer is available when Files app renders
 *
 * @copyright Copyright (c) 2025
 * @license AGPL-3.0-or-later
 */

namespace OCA\ThreeDViewer\Listener;

use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Util;

/**
 * @template-implements IEventListener<BeforeTemplateRenderedEvent>
 */
class LoadFilesListener implements IEventListener
{
    public function handle(Event $event): void
    {
        if (!$event instanceof BeforeTemplateRenderedEvent) {
            return;
        }

        // Only load in user context (skip for admin pages)
        if (!$event->isLoggedIn()) {
            return;
        }

        // Load our viewer handler script
        // This registers the handler with OCA.Viewer before Files app renders
        Util::addScript('threedviewer', 'threedviewer-main');
    }
}
