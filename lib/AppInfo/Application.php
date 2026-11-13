<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\AppInfo;

use OCA\Files_Sharing\Event\BeforeTemplateRenderedEvent as PublicShareTemplateRenderedEvent;
use OCA\ThreeDViewer\Constants\SupportedFormats;
use OCA\ThreeDViewer\Listener\CspListener;
use OCA\ThreeDViewer\Listener\FileIndexListener;
use OCA\ThreeDViewer\Listener\LoadFilesListener;
use OCA\ThreeDViewer\Listener\LoadPublicShareListener;
use OCA\ThreeDViewer\Listener\LoadViewerListener;
use OCA\ThreeDViewer\Listener\ReferenceInvalidationListener;
use OCA\ThreeDViewer\Listener\RenderReferenceListener;
use OCA\ThreeDViewer\Listener\ThumbnailInvalidationListener;
use OCA\ThreeDViewer\Notification\Notifier;
use OCA\ThreeDViewer\Preview\ModelPreviewProvider;
use OCA\ThreeDViewer\Reference\ModelReferenceProvider;
use OCA\ThreeDViewer\Repair\RegisterThreeDMimeTypes;
use OCA\ThreeDViewer\Search\ModelSearchProvider;
use OCA\ThreeDViewer\Settings\Personal;
use OCA\ThreeDViewer\Settings\Section;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent;
use OCP\Collaboration\Reference\RenderReferenceEvent;
use OCP\Files\Events\Node\NodeCreatedEvent;
use OCP\Files\Events\Node\NodeDeletedEvent;
use OCP\Files\Events\Node\NodeWrittenEvent;
use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\Security\CSP\AddContentSecurityPolicyEvent;

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

        // Public share pages are a separate render path: LoadFilesListener skips them
        // (no logged-in user) and the Viewer app does not dispatch LoadViewer there.
        if (class_exists(PublicShareTemplateRenderedEvent::class)) {
            $context->registerEventListener(PublicShareTemplateRenderedEvent::class, LoadPublicShareListener::class);
        }

        // Ensure our MIME registration repair step runs during `occ maintenance:repair`
        // in addition to install/enable flows declared in info.xml
        if (method_exists($context, 'registerRepairStep')) {
            $context->registerRepairStep(RegisterThreeDMimeTypes::class);
        }

        // Register preview provider for 3D model files
        // The provider returns stored client-generated thumbnails when available. The regex
        // is derived from the supported formats, because not every one is a model/* type
        // (ifc, fcstd and gcode are not), and generic types like octet-stream stay out.
        $context->registerPreviewProvider(ModelPreviewProvider::class, SupportedFormats::getPreviewMimeRegex());

        // Register file index listener to automatically update index on file changes
        $context->registerEventListener(NodeCreatedEvent::class, FileIndexListener::class);
        $context->registerEventListener(NodeWrittenEvent::class, FileIndexListener::class);
        $context->registerEventListener(NodeDeletedEvent::class, FileIndexListener::class);

        // Thumbnails are stored per file version; drop them when the file changes or goes
        $context->registerEventListener(NodeWrittenEvent::class, ThumbnailInvalidationListener::class);
        $context->registerEventListener(NodeDeletedEvent::class, ThumbnailInvalidationListener::class);

        // Links to a model show as a card where apps render link previews, and "3D models"
        // is in the Smart Picker. The provider claims the app's own viewer links only, not
        // Files links, which core's Files provider answers for (see ModelReferenceProvider).
        $context->registerReferenceProvider(ModelReferenceProvider::class);
        $context->registerSearchProvider(ModelSearchProvider::class);
        // The card itself is a script of its own, added only to pages that render previews
        $context->registerEventListener(RenderReferenceEvent::class, RenderReferenceListener::class);
        // A card is cached for an hour; core drops it on delete, rename and share, this on write
        $context->registerEventListener(NodeWrittenEvent::class, ReferenceInvalidationListener::class);

        // Source allowances (blob:, data:) are only applied to 3D viewer routes via
        // ResponseBuilder, which prevents conflicts with other apps' CSP requirements.
        // The one exception is WebAssembly: the viewer opens inside the Files app, whose
        // policy is the server's, so that has to be contributed through the additive event.
        $context->registerEventListener(AddContentSecurityPolicyEvent::class, CspListener::class);

        // The bell's text for a note added to a model. The Activity app's setting, filter
        // and provider for the same news are declared in info.xml.
        $context->registerNotifierService(Notifier::class);
    }

    public function boot(IBootContext $context): void
    {
    }
}
