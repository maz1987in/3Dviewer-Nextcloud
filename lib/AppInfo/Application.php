<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\AppInfo;

use OCA\ThreeDViewer\Command\IndexFiles;
use OCA\ThreeDViewer\Listener\FileIndexListener;
use OCA\ThreeDViewer\Listener\LoadFilesListener;
use OCA\ThreeDViewer\Listener\LoadViewerListener;
use OCA\ThreeDViewer\Preview\ModelPreviewProvider;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent;
use OCP\Files\Events\Node\NodeCreatedEvent;
use OCP\Files\Events\Node\NodeDeletedEvent;
use OCP\Files\Events\Node\NodeWrittenEvent;

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

        // Register preview provider for 3D model files
        // Can be enabled/disabled by admins via enabledPreviewProviders config
        // Must register for each MIME type individually
        $supportedMimes = [
            'model/gltf-binary',        // .glb
            'model/gltf+json',          // .gltf
            'model/obj',                // .obj
            'model/stl',                // .stl
            'application/sla',          // .stl alternative
            'model/ply',                // .ply
            'model/vnd.collada+xml',    // .dae
            'model/3mf',                // .3mf
            'model/x3d+xml',            // .x3d
            'model/vrml',               // .vrml, .wrl
            'application/octet-stream',  // Used for fbx, 3ds (with extension check)
        ];
        foreach ($supportedMimes as $mimeType) {
            $context->registerPreviewProvider($mimeType, ModelPreviewProvider::class);
        }

        // Register file index listener to automatically update index on file changes
        $context->registerEventListener(NodeCreatedEvent::class, FileIndexListener::class);
        $context->registerEventListener(NodeWrittenEvent::class, FileIndexListener::class);
        $context->registerEventListener(NodeDeletedEvent::class, FileIndexListener::class);

        // Register console command for indexing files
        // Commands are auto-discovered if they extend Command and are in Command namespace
        // But we also explicitly register it for clarity
        if (method_exists($context, 'registerCommand')) {
            $context->registerCommand(IndexFiles::class);
        }

        // CSP modifications are now only applied to 3D viewer routes via PageController
        // This prevents conflicts with other apps' CSP requirements
    }

    public function boot(IBootContext $context): void
    {
    }
}
