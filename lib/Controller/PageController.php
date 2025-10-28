<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCA\ThreeDViewer\AppInfo\Application;
use OCA\ThreeDViewer\Service\ResponseBuilder;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\OpenAPI;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Services\InitialStateProvider;
use OCP\IRequest;

/**
 * @psalm-suppress UnusedClass
 */
class PageController extends Controller
{
    private ResponseBuilder $responseBuilder;

    public function __construct(
        string $appName,
        IRequest $request,
        ResponseBuilder $responseBuilder
    ) {
        parent::__construct($appName, $request);
        $this->responseBuilder = $responseBuilder;
    }

    #[NoCSRFRequired]
    #[NoAdminRequired]
    #[OpenAPI(OpenAPI::SCOPE_IGNORE)]
    #[FrontpageRoute(verb: 'GET', url: '/')]
    public function index(): TemplateResponse
    {
        $response = new TemplateResponse(
            Application::APP_ID,
            'index',
        );

        // Add CSP headers for 3D viewer compatibility
        $this->responseBuilder->addCspHeaders($response);

        return $response;
    }

    /**
     * Viewer page for specific file
     * URL: /apps/threedviewer/{fileId}?dir=/optional/path
     */
    #[NoCSRFRequired]
    #[NoAdminRequired]
    #[OpenAPI(OpenAPI::SCOPE_IGNORE)]
    #[FrontpageRoute(verb: 'GET', url: '/{fileId}')]
    public function viewer(string $fileId): TemplateResponse
    {
        // Only handle numeric file IDs to avoid conflicts with static assets
        if (!is_numeric($fileId)) {
            // Return 404 for non-numeric paths (like img/app-color.png)
            $response = new TemplateResponse(
                'core',
                '404',
                [],
                TemplateResponse::RENDER_AS_ERROR
            );
            $response->setStatus(404);
            return $response;
        }

        $response = new TemplateResponse(
            Application::APP_ID,
            'index',
            [
                'fileId' => $fileId,
            ]
        );

        // Add CSP headers for 3D viewer compatibility
        $this->responseBuilder->addCspHeaders($response);

        return $response;
    }
}
