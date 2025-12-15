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
use OCP\Files\IRootFolder;
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
        private ?IUserSession $userSession,
        private IRootFolder $rootFolder
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
            'selectedFileId' => (int) $selectedFileId,
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

        // Try to fetch file information to get filename and directory path
        $filename = null;
        $dir = null;
        if ($user) {
            try {
                $userFolder = $this->rootFolder->getUserFolder($user->getUID());
                $files = $userFolder->getById((int) $fileId);
                if (!empty($files) && $files[0] instanceof \OCP\Files\File) {
                    $file = $files[0];
                    $filename = $file->getName();
                    // Extract directory path from file path
                    $filePath = $file->getPath();
                    $userPath = $userFolder->getPath();
                    // Remove user folder path prefix to get relative path
                    if (strpos($filePath, $userPath) === 0) {
                        $relativePath = substr($filePath, strlen($userPath));
                        $dir = dirname($relativePath);
                        // Normalize: remove leading slash and handle root
                        $dir = ltrim($dir, '/');
                        if ($dir === '.' || $dir === '') {
                            $dir = null;
                        }
                    }
                }
            } catch (\Throwable $e) {
                // If file lookup fails, continue without filename - App.vue will handle gracefully
                // This allows the route to work even if file is deleted or inaccessible
            }
        }

        // Provide initial state
        $initialState = [
            'defaultSort' => $defaultSort,
            'selectedFileId' => (int) $fileId,
            'userId' => $userId,
        ];

        $this->initialState->provideInitialState('navigation-initial-state', $initialState);

        $response = new TemplateResponse(
            Application::APP_ID,
            'index',
            [
                'fileId' => $fileId,
                'filename' => $filename,
                'dir' => $dir,
            ]
        );

        // Add CSP headers for 3D viewer compatibility
        $this->responseBuilder->addCspHeaders($response);

        return $response;
    }
}
