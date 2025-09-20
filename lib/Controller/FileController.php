<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\StreamResponse;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\IRequest;
use OCP\IUserSession;

/**
 * Controller for serving 3D files using Nextcloud filesystem API
 */
class FileController extends Controller {
    public function __construct(
        string $appName,
        IRequest $request,
        private readonly IRootFolder $rootFolder,
        private readonly IUserSession $userSession,
        private readonly ModelFileSupport $modelFileSupport,
    ) {
        parent::__construct($appName, $request);
    }

    /**
     * Serve a 3D file by ID using Nextcloud filesystem API
     * @NoCSRFRequired
     */
    public function serveFile(int $fileId): StreamResponse|JSONResponse {
        try {
            $user = $this->userSession->getUser();
            if ($user === null) {
                return new JSONResponse(['error' => 'User not authenticated'], Http::STATUS_UNAUTHORIZED);
            }

            // Get user's folder
            $userFolder = $this->rootFolder->getUserFolder($user->getUID());
            
            // Find file by ID
            $files = $userFolder->getById($fileId);
            if (empty($files)) {
                return new JSONResponse(['error' => 'File not found'], Http::STATUS_NOT_FOUND);
            }

            $file = $files[0];
            if (!$file instanceof \OCP\Files\File) {
                return new JSONResponse(['error' => 'Not a file'], Http::STATUS_BAD_REQUEST);
            }

            // Check if file is supported
            $extension = strtolower($file->getExtension());
            if (!$this->modelFileSupport->isSupported($extension)) {
                return new JSONResponse(['error' => 'Unsupported file type'], Http::STATUS_UNSUPPORTED_MEDIA_TYPE);
            }

            // Open file stream
            $stream = $file->fopen('r');
            if ($stream === false) {
                return new JSONResponse(['error' => 'Failed to open file'], Http::STATUS_INTERNAL_SERVER_ERROR);
            }

            // Create response
            $response = new StreamResponse($stream);
            $response->addHeader('Content-Type', $this->modelFileSupport->mapContentType($extension));
            $response->addHeader('Content-Length', (string)$file->getSize());
            $response->addHeader('Content-Disposition', 'inline; filename="' . addslashes($file->getName()) . '"');
            $response->addHeader('Cache-Control', 'no-store');

            return $response;

        } catch (NotFoundException $e) {
            return new JSONResponse(['error' => 'File not found'], Http::STATUS_NOT_FOUND);
        } catch (\Exception $e) {
            return new JSONResponse(['error' => 'Internal server error'], Http::STATUS_INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * List 3D files in user's folder
     * @NoCSRFRequired
     */
    public function listFiles(): JSONResponse {
        try {
            $user = $this->userSession->getUser();
            if ($user === null) {
                return new JSONResponse(['error' => 'User not authenticated'], Http::STATUS_UNAUTHORIZED);
            }

            $userFolder = $this->rootFolder->getUserFolder($user->getUID());
            $files = [];

            // Recursively find all 3D files
            $this->find3DFiles($userFolder, $files);

            return new JSONResponse(['files' => $files]);

        } catch (\Exception $e) {
            return new JSONResponse(['error' => 'Internal server error'], Http::STATUS_INTERNAL_SERVER_ERROR);
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
                        'extension' => $extension
                    ];
                }
            } elseif ($node instanceof \OCP\Files\Folder) {
                $this->find3DFiles($node, $files);
            }
        }
    }
}
