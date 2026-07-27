<?php

declare(strict_types=1);

/**
 * Loads the 3D viewer on public share pages.
 *
 * @copyright Copyright (c) 2026
 * @license AGPL-3.0-or-later
 */

namespace OCA\ThreeDViewer\Listener;

use OCA\Files_Sharing\Event\BeforeTemplateRenderedEvent;
use OCA\ThreeDViewer\AppInfo\Application;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCP\AppFramework\Services\IInitialState;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Util;

/**
 * Anonymous visitors never got the viewer: LoadFilesListener returns early on
 * `!isLoggedIn()`, and the Viewer app does not dispatch its LoadViewer event on the
 * public share template. This listener is the public-page counterpart, and hands the
 * frontend the share token so it can stream through the public endpoint rather than
 * the session-authenticated one.
 *
 * @template-implements IEventListener<BeforeTemplateRenderedEvent>
 */
class LoadPublicShareListener implements IEventListener
{
    public function __construct(
        private readonly ModelFileSupport $support,
        private readonly IInitialState $initialState,
    ) {
    }

    public function handle(Event $event): void
    {
        if (!$event instanceof BeforeTemplateRenderedEvent) {
            return;
        }

        // The password prompt renders through the same event. Loading a multi-megabyte
        // 3D bundle behind a login form helps nobody, and the token is not usable yet.
        if ($event->getScope() === BeforeTemplateRenderedEvent::SCOPE_PUBLIC_SHARE_AUTH) {
            return;
        }

        $node = $event->getShare()->getNode();

        if ($node instanceof Folder) {
            // Any of the contents might be a model; the Viewer handler decides per file.
            $fileId = null;
            $filename = null;
            $mime = null;
        } elseif ($node instanceof File && $this->support->isSupported(strtolower($node->getExtension()))) {
            $fileId = $node->getId();
            // The single-file page mounts the viewer directly, with no file listing
            // to consult, so it needs the name and type up front.
            $filename = $node->getName();
            $mime = $node->getMimeType();
        } else {
            // A shared .txt or .pdf must not pull in the 3D bundle.
            return;
        }

        $this->initialState->provideInitialState('publicShare', [
            'token' => $event->getShare()->getToken(),
            'fileId' => $fileId,
            'isSingleFile' => $fileId !== null,
            'filename' => $filename,
            'mime' => $mime,
        ]);

        $this->addViewerScript();
    }

    /**
     * Seam for testing: Util::addScript is static and needs a live server.
     */
    protected function addViewerScript(): void
    {
        Util::addScript(Application::APP_ID, 'threedviewer-main');
    }
}
