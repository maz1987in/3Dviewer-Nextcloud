<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Listener;

use OCA\ThreeDViewer\AppInfo\Application;
use OCP\Collaboration\Reference\RenderReferenceEvent;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Util;

/**
 * Loads the card for 3D model links on pages that render link previews.
 *
 * Talk, Text, Collectives and the Files app fire RenderReferenceEvent when they are about to
 * show links as cards. The script it adds is its own entry, a few kilobytes that register the
 * card and nothing else; it never loads three.js or the viewer.
 *
 * @template-implements IEventListener<RenderReferenceEvent>
 */
class RenderReferenceListener implements IEventListener
{
    public function handle(Event $event): void
    {
        if (!$event instanceof RenderReferenceEvent) {
            return;
        }

        $this->addCardAssets();
    }

    /**
     * Seam for testing: Util::addScript is static and needs a live server.
     */
    protected function addCardAssets(): void
    {
        Util::addScript(Application::APP_ID, 'threedviewer-reference');
        Util::addStyle(Application::APP_ID, 'threedviewer-reference');
    }
}
