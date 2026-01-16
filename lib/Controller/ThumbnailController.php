<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\ResponseBuilder;
use OCA\ThreeDViewer\Service\ThumbnailService;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\Files\IRootFolder;
use OCP\ICacheFactory;
use OCP\IRequest;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;

/**
 * Controller for handling thumbnail uploads from client.
 */
class ThumbnailController extends BaseController
{
    private const MAX_THUMBNAIL_SIZE_BYTES = 1024 * 1024; // 1MB max per thumbnail
    private const SUPPORTED_FORMATS = ['glb', 'gltf', 'obj', 'stl', 'ply', '3mf', 'fbx', 'dae', '3ds', 'x3d', 'wrl', 'vrml'];

    private IRootFolder $rootFolder;
    private IUserSession $userSession;
    private ThumbnailService $thumbnailService;

    public function __construct(
        string $appName,
        IRequest $request,
        IRootFolder $rootFolder,
        IUserSession $userSession,
        ThumbnailService $thumbnailService,
        ResponseBuilder $responseBuilder,
        ModelFileSupport $modelFileSupport,
        LoggerInterface $logger,
        ICacheFactory $cacheFactory
    ) {
        parent::__construct($appName, $request, $responseBuilder, $modelFileSupport, $logger, $cacheFactory);
        $this->rootFolder = $rootFolder;
        $this->userSession = $userSession;
        $this->thumbnailService = $thumbnailService;
    }

    /**
     * Store a thumbnail for a 3D model file.
     * Accepts POST request with image data in request body (base64 or binary).
     * 
     * @param int $fileId The file ID to store thumbnail for
     * @return JSONResponse Success or error response
     */
    #[NoAdminRequired]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'POST', url: '/api/thumbnail/{fileId}')]
    public function storeThumbnail(int $fileId): JSONResponse
    {
        try {
            // Validate file ID
            $fileId = $this->validateFileId($fileId);

            // Check authentication
            $user = $this->userSession->getUser();
            if ($user === null) {
                $this->logger->warning('ThumbnailController: User not authenticated', ['fileId' => $fileId]);
                return $this->responseBuilder->createUnauthorizedResponse('User not authenticated');
            }

            $userId = $user->getUID();

            // Verify file exists and belongs to user
            $userFolder = $this->rootFolder->getUserFolder($userId);
            $files = $userFolder->getById($fileId);

            if (empty($files)) {
                $this->logger->warning('ThumbnailController: File not found', [
                    'fileId' => $fileId,
                    'userId' => $userId,
                ]);
                return $this->responseBuilder->createNotFoundResponse('File not found');
            }

            $file = $files[0];
            if (!$file instanceof \OCP\Files\File) {
                return $this->responseBuilder->createBadRequestResponse('Path is not a file');
            }

            // Check if file format is supported for thumbnails
            $extension = strtolower($file->getExtension());
            if (!in_array($extension, self::SUPPORTED_FORMATS, true)) {
                $this->logger->info('ThumbnailController: Format not supported for thumbnails', [
                    'fileId' => $fileId,
                    'userId' => $userId,
                    'extension' => $extension,
                ]);
                return $this->responseBuilder->createBadRequestResponse('File format not supported for thumbnails');
            }

            // Enforce content-length limit
            $contentLengthHeader = $this->request->getHeader('Content-Length');
            if (!empty($contentLengthHeader) && (int)$contentLengthHeader > self::MAX_THUMBNAIL_SIZE_BYTES) {
                $this->logger->warning('ThumbnailController: Upload rejected - Content-Length exceeds limit', [
                    'fileId' => $fileId,
                    'userId' => $userId,
                    'contentLength' => (int)$contentLengthHeader,
                ]);
                return $this->responseBuilder->createBadRequestResponse('Thumbnail too large');
            }

            // Get image data from request body
            $imageData = file_get_contents('php://input');
            if ($imageData === false || empty($imageData)) {
                return $this->responseBuilder->createBadRequestResponse('No image data provided');
            }

            // Handle base64 encoded data
            if (preg_match('/^data:image\/(png|jpeg|jpg);base64,(.+)$/i', $imageData, $matches)) {
                $imageData = base64_decode($matches[2], true);
                if ($imageData === false) {
                    return $this->responseBuilder->createBadRequestResponse('Invalid base64 data');
                }
            }

            // Validate image size after decoding
            $imageSize = strlen($imageData);
            if ($imageSize > self::MAX_THUMBNAIL_SIZE_BYTES) {
                $this->logger->warning('ThumbnailController: Upload rejected - image size exceeds limit', [
                    'fileId' => $fileId,
                    'userId' => $userId,
                    'imageSize' => $imageSize,
                ]);
                return $this->responseBuilder->createBadRequestResponse('Thumbnail too large');
            }

            // Store thumbnail
            $success = $this->thumbnailService->storeThumbnail($fileId, $userId, $imageData);
            if (!$success) {
                $this->logger->error('ThumbnailController: Failed to store thumbnail', [
                    'fileId' => $fileId,
                    'userId' => $userId,
                ]);
                return $this->responseBuilder->createInternalServerErrorResponse('Failed to store thumbnail');
            }

            $this->logger->info('ThumbnailController: Thumbnail stored successfully', [
                'fileId' => $fileId,
                'userId' => $userId,
                'size' => $imageSize,
            ]);

            return new JSONResponse([
                'success' => true,
                'fileId' => $fileId,
                'size' => $imageSize,
            ]);
        } catch (\Throwable $e) {
            return $this->handleException($e);
        }
    }

    /**
     * Clear all thumbnails for the current user.
     * 
     * @return JSONResponse Success response with count of deleted thumbnails
     */
    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'DELETE', url: '/api/thumbnails')]
    public function clearThumbnails(): JSONResponse
    {
        try {
            // Check authentication
            $user = $this->userSession->getUser();
            if ($user === null) {
                $this->logger->warning('ThumbnailController: User not authenticated for clear operation');
                return $this->responseBuilder->createUnauthorizedResponse('User not authenticated');
            }

            $userId = $user->getUID();

            // Clear all thumbnails for this user
            $deletedCount = $this->thumbnailService->clearAllThumbnails($userId);

            $this->logger->info('ThumbnailController: Thumbnails cleared', [
                'userId' => $userId,
                'deletedCount' => $deletedCount,
            ]);

            return new JSONResponse([
                'success' => true,
                'deletedCount' => $deletedCount,
            ]);
        } catch (\Throwable $e) {
            return $this->handleException($e);
        }
    }
}
