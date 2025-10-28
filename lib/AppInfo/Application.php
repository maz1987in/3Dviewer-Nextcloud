<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\AppInfo;

use OCA\ThreeDViewer\Listener\CspListener;
use OCA\ThreeDViewer\Listener\LoadFilesListener;
use OCA\ThreeDViewer\Listener\LoadViewerListener;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent;

class Application extends App implements IBootstrap
{
    public const APP_ID = 'threedviewer';

    public function __construct(array $urlParams = [])
    {
        parent::__construct(self::APP_ID, $urlParams);
    }

    public function register(IRegistrationContext $context): void
    {
        // Register listener for when Viewer app loads
        // This follows the pattern from files_pdfviewer
        if (class_exists('OCA\Viewer\Event\LoadViewer')) {
            $context->registerEventListener(\OCA\Viewer\Event\LoadViewer::class, LoadViewerListener::class);
        }

        // Register listener to load our script on every page (Files app context)
        // This ensures our viewer handler is registered before Files app renders
        $context->registerEventListener(BeforeTemplateRenderedEvent::class, LoadFilesListener::class);

        // Register CSP listener to allow blob URLs for 3D viewer
        $context->registerEventListener(BeforeTemplateRenderedEvent::class, CspListener::class);
    }

    public function boot(IBootContext $context): void
    {
    }
}
