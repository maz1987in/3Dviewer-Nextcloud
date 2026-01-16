<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\AppInfo;

use OCA\ThreeDViewer\Listener\FileIndexListener;
use OCA\ThreeDViewer\Listener\LoadFilesListener;
use OCA\ThreeDViewer\Listener\LoadViewerListener;
use OCA\ThreeDViewer\Preview\ModelPreviewProvider;
use OCA\ThreeDViewer\Repair\RegisterThreeDMimeTypes;
use OCA\ThreeDViewer\Settings\Personal;
use OCA\ThreeDViewer\Settings\Section;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent;
use OCP\Files\Events\Node\NodeCreatedEvent;
use OCP\Files\Events\Node\NodeDeletedEvent;
use OCP\Files\Events\Node\NodeWrittenEvent;
use OCP\IL10N;
use OCP\IURLGenerator;

class Application extends App implements IBootstrap
{
    public const APP_ID = 'threedviewer';

    public function __construct(array $urlParams = [])
    {
        parent::__construct(self::APP_ID, $urlParams);
    }

    public function register(IRegistrationContext $context): void
    {
        // Register Settings
        $context->registerService(Personal::class, function ($c) {
            return new Personal();
        });
        $context->registerService(Section::class, function ($c) {
            return new Section(
                $c->query(IURLGenerator::class),
                $c->query(IL10N::class)
            );
        });

        // Register listener for when Viewer app loads
        // This follows the pattern from files_pdfviewer
        if (class_exists('OCA\Viewer\Event\LoadViewer')) {
            $context->registerEventListener(\OCA\Viewer\Event\LoadViewer::class, LoadViewerListener::class);
        }

        // Register listener to load our script on every page (Files app context)
        // This ensures our viewer handler is registered before Files app renders
        $context->registerEventListener(BeforeTemplateRenderedEvent::class, LoadFilesListener::class);

        // Ensure our MIME registration repair step runs during `occ maintenance:repair`
        // in addition to install/enable flows declared in info.xml
        if (method_exists($context, 'registerRepairStep')) {
            $context->registerRepairStep(RegisterThreeDMimeTypes::class);
        }

        // Register preview provider for 3D model files
        // The provider returns stored client-generated thumbnails when available
        // Uses regex '/^model\/.*/' to match all model/* MIME types
        $context->registerPreviewProvider(ModelPreviewProvider::class, '/^model\\/.*/');

        // Register file index listener to automatically update index on file changes
        $context->registerEventListener(NodeCreatedEvent::class, FileIndexListener::class);
        $context->registerEventListener(NodeWrittenEvent::class, FileIndexListener::class);
        $context->registerEventListener(NodeDeletedEvent::class, FileIndexListener::class);

        // CSP modifications are now only applied to 3D viewer routes via PageController
        // This prevents conflicts with other apps' CSP requirements
    }

    public function boot(IBootContext $context): void
    {
    }
}
