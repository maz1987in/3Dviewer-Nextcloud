<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCA\ThreeDViewer\AppInfo\Application;
use OCA\ThreeDViewer\Service\EmbedOrigins;
use OCA\ThreeDViewer\Service\ResponseBuilder;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\NoSameSiteCookieRequired;
use OCP\AppFramework\Http\Attribute\OpenAPI;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IRequest;

/**
 * The page a listed site frames: the same page for every /embed/{token} URL. It reads
 * no share and reveals nothing about one; its script reads the token from the URL and
 * asks PublicEmbedController, which checks the share. Kept apart so that a share that
 * is gone can be said so inside the frame: the share middleware's own "not found" page
 * may not be framed, so the visitor would see only the browser's refusal.
 *
 * This is the only response that lists other sites in `frame-ancestors`; every other
 * page keeps Nextcloud's `'self'`.
 *
 * @psalm-suppress UnusedClass Routed via attribute registration in Nextcloud runtime.
 */
class EmbedPageController extends Controller
{
    public function __construct(
        string $appName,
        IRequest $request,
        private readonly EmbedOrigins $origins,
        private readonly ResponseBuilder $responseBuilder,
    ) {
        parent::__construct($appName, $request);
    }

    /**
     * No session or same-site cookie: a frame on another site sends neither. The
     * attribute exists from Nextcloud 34; 31 to 33 read only the annotation.
     *
     * @NoSameSiteCookieRequired
     */
    #[PublicPage]
    #[NoCSRFRequired]
    #[NoSameSiteCookieRequired]
    #[OpenAPI(OpenAPI::SCOPE_IGNORE)]
    #[FrontpageRoute(verb: 'GET', url: '/embed/{token}')]
    public function page(): TemplateResponse
    {
        $response = new TemplateResponse(Application::APP_ID, 'embed', [], TemplateResponse::RENDER_AS_BASE);
        $origins = $this->origins->list();
        if ($origins === []) {
            $response->setStatus(Http::STATUS_NOT_FOUND);
        }

        $csp = new ContentSecurityPolicy();
        foreach ($origins as $origin) {
            $csp->addAllowedFrameAncestorDomain($origin);
        }
        $response->setContentSecurityPolicy($csp);
        // Adds the viewer's own allowances to the policy above
        $this->responseBuilder->addCspHeaders($response);

        return $response;
    }
}
