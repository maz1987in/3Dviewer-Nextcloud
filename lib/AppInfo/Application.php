<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\AppInfo;

use OCA\ThreeDViewer\Listener\FileIndexListener;
use OCA\ThreeDViewer\Listener\LoadFilesListener;
use OCA\ThreeDViewer\Listener\LoadViewerListener;
use OCA\ThreeDViewer\Preview\ModelPreviewProvider;
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

        // Register preview provider for 3D model files
        // Can be enabled/disabled by admins via enabledPreviewProviders config
        // Must register for each MIME type individually

        // NOTE: Preview provider registration is currently disabled to prevent "Delimiter must not be alphanumeric"
        // errors in Nextcloud's PreviewManager regex matching.
        // 3D files will automatically use the custom SVG icons registered via mimetypemapping.json/mimetypealiases.json
        // which provides the desired behavior without the server logs spam.
        /*
        $supportedMimes = [
            'model/gltf-binary', 'model/gltf+json', 'model/obj', 'model/stl',
            'application/sla', 'model/ply', 'model/vnd.collada+xml', 'model/3mf',
            'model/x3d+xml', 'model/vrml', 'application/octet-stream'
        ];
        foreach ($supportedMimes as $mimeType) {
            $context->registerPreviewProvider($mimeType, ModelPreviewProvider::class);
        }
        */

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
