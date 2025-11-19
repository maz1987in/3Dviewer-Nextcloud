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
use OCP\AppFramework\Services\IInitialState;
use OCP\IConfig;
use OCP\IRequest;
use OCP\IUserSession;

/**
 * @psalm-suppress UnusedClass
 */
class PageController extends Controller
{
    private ResponseBuilder $responseBuilder;

    public function __construct(
        string $appName,
        IRequest $request,
        ResponseBuilder $responseBuilder,
        private IInitialState $initialState,
        private IConfig $config,
        private ?IUserSession $userSession
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
        $user = $this->userSession?->getUser();
        $userId = $user?->getUID();

        // Get default sort preference
        $defaultSort = $this->config->getUserValue($userId ?? '', Application::APP_ID, 'file_sort', 'folders');
        $selectedFileId = $this->config->getUserValue($userId ?? '', Application::APP_ID, 'selected_file_id', '0');

        // Provide initial state
        $initialState = [
            'defaultSort' => $defaultSort,
            'selectedFileId' => (int)$selectedFileId,
            'userId' => $userId,
        ];

        $this->initialState->provideInitialState('navigation-initial-state', $initialState);

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
     * URL: /apps/threedviewer/f/{fileId}?dir=/optional/path
     * Note: Using /f/ prefix to avoid conflicts with static assets (img/, css/, js/).
     */
    #[NoCSRFRequired]
    #[NoAdminRequired]
    #[OpenAPI(OpenAPI::SCOPE_IGNORE)]
    #[FrontpageRoute(verb: 'GET', url: '/f/{fileId}')]
    public function viewer(string $fileId): TemplateResponse
    {
        $user = $this->userSession?->getUser();
        $userId = $user?->getUID();

        // Save selected file ID preference
        if ($userId) {
            $this->config->setUserValue($userId, Application::APP_ID, 'selected_file_id', $fileId);
        }

        // Get default sort preference
        $defaultSort = $this->config->getUserValue($userId ?? '', Application::APP_ID, 'file_sort', 'folders');

        // Provide initial state
        $initialState = [
            'defaultSort' => $defaultSort,
            'selectedFileId' => (int)$fileId,
            'userId' => $userId,
        ];

        $this->initialState->provideInitialState('navigation-initial-state', $initialState);

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
