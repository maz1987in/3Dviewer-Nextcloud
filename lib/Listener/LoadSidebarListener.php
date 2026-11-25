<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Listener;

use OCA\Files\Event\LoadSidebar;
use OCA\ThreeDViewer\AppInfo\Application;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Util;

/**
 * Adds the "3D" tab to the Files sidebar, on every page that renders the sidebar.
 *
 * The Files app asks for sidebar scripts with its LoadSidebar event, which is how its own
 * Versions tab loads. The entry is an init script, so the tab is registered before the
 * sidebar first opens. It carries only the tab's registration; the tab itself loads when
 * the sidebar is opened on a model.
 *
 * @template-implements IEventListener<Event>
 */
class LoadSidebarListener implements IEventListener
{
    public function handle(Event $event): void
    {
        if (!$event instanceof LoadSidebar) {
            return;
        }

        $this->addSidebarAssets();
    }

    protected function addSidebarAssets(): void
    {
        Util::addInitScript(Application::APP_ID, 'threedviewer-files-sidebar');
        Util::addStyle(Application::APP_ID, 'threedviewer-files-sidebar');
    }
}
