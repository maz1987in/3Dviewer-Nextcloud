<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\ResponseBuilder;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\StreamResponse;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\IRequest;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;

/**
 * Controller for serving 3D files using Nextcloud filesystem API
 */
class FileController extends BaseController {
    public function __construct(
        string $appName,
        IRequest $request,
        private readonly IRootFolder $rootFolder,
        private readonly IUserSession $userSession,
        ModelFileSupport $modelFileSupport,
        ResponseBuilder $responseBuilder,
        LoggerInterface $logger
    ) {
        parent::__construct($appName, $request, $responseBuilder, $modelFileSupport, $logger);
    }

    /**
     * Test endpoint to verify routing is working
     */
    #[NoCSRFRequired]
    public function test(): JSONResponse {
        return new JSONResponse(['status' => 'ok', 'message' => 'FileController is working']);
    }

    /**
     * Serve a 3D file by ID using Nextcloud filesystem API
     */
    #[NoCSRFRequired]
    public function serveFile(int $fileId): StreamResponse|JSONResponse {
        try {
            // Validate file ID
            $fileId = $this->validateFileId($fileId);
            
            // Check authentication
            $user = $this->userSession->getUser();
            if ($user === null) {
                return $this->responseBuilder->createUnauthorizedResponse('User not authenticated');
            }

            // Get user's folder and find file
            $userFolder = $this->rootFolder->getUserFolder($user->getUID());
            $files = $userFolder->getById($fileId);
            
            if (empty($files)) {
                return $this->responseBuilder->createNotFoundResponse('File not found');
            }

            $file = $files[0];
            if (!$file instanceof \OCP\Files\File) {
                return $this->responseBuilder->createBadRequestResponse('Not a file');
            }

            // Validate file
            $this->validateFile($file);
            
            // Check file size
            if (!$this->isFileSizeAcceptable($file)) {
                return $this->responseBuilder->createErrorResponse(
                    'File too large',
                    Http::STATUS_REQUEST_ENTITY_TOO_LARGE,
                    [
                        'file_size' => $this->formatFileSize($file->getSize()),
                        'max_size' => $this->formatFileSize(500 * 1024 * 1024)
                    ]
                );
            }

            // Log file access
            $this->logFileAccess($file, 'serve', [
                'size_category' => $this->getFileSizeCategory($file),
                'client_ip' => $this->getClientIp(),
                'is_mobile' => $this->isMobileRequest()
            ]);

            // Build and return response
            $extension = strtolower($file->getExtension());
            return $this->responseBuilder->buildStreamResponse($file, $extension);

        } catch (\Throwable $e) {
            return $this->handleException($e);
        }
    }

    /**
     * List 3D files in user's folder
     */
    #[NoCSRFRequired]
    public function listFiles(): JSONResponse {
        try {
            // Check authentication
            $user = $this->userSession->getUser();
            if ($user === null) {
                return $this->responseBuilder->createUnauthorizedResponse('User not authenticated');
            }

            $userFolder = $this->rootFolder->getUserFolder($user->getUID());
            $files = [];

            // Recursively find all 3D files
            $this->find3DFiles($userFolder, $files);

            // Log file listing
            $this->logger->info('File list requested', [
                'user_id' => $user->getUID(),
                'total_files' => count($files),
                'client_ip' => $this->getClientIp()
            ]);

            return $this->responseBuilder->createFileListResponse($files, count($files));

        } catch (\Throwable $e) {
            return $this->handleException($e);
        }
    }

    /**
     * Recursively find 3D files in a folder
     */
    private function find3DFiles(\OCP\Files\Folder $folder, array &$files): void {
        $children = $folder->getDirectoryListing();
        
        foreach ($children as $node) {
            if ($node instanceof \OCP\Files\File) {
                $extension = strtolower($node->getExtension());
                if ($this->modelFileSupport->isSupported($extension)) {
                    $files[] = [
                        'id' => $node->getId(),
                        'name' => $node->getName(),
                        'path' => $node->getPath(),
                        'size' => $node->getSize(),
                        'mtime' => $node->getMTime(),
                        'extension' => $extension,
                        'size_category' => $this->getFileSizeCategory($node),
                        'formatted_size' => $this->formatFileSize($node->getSize())
                    ];
                }
            } elseif ($node instanceof \OCP\Files\Folder) {
                $this->find3DFiles($node, $files);
            }
        }
    }
}
