<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\Files\IRootFolder;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\IUserSession;
use OCP\Share\IManager as ShareManager;
use OCP\Share\IShare;
use Psr\Log\LoggerInterface;

/**
 * Controller for handling slicer integration.
 */
class SlicerController extends Controller
{
    private const TEMP_FOLDER = '.3dviewer_temp';
    private const MAX_TEMP_FILE_AGE = 86400; // 24 hours
    private const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB per file
    private const MAX_TEMP_FOLDER_BYTES = 200 * 1024 * 1024; // 200 MB rolling cap

    private IRootFolder $rootFolder;
    private IUserSession $userSession;
    private IURLGenerator $urlGenerator;
    private ShareManager $shareManager;
    private LoggerInterface $logger;

    public function __construct(
        string $appName,
        IRequest $request,
        IRootFolder $rootFolder,
        IUserSession $userSession,
        IURLGenerator $urlGenerator,
        ShareManager $shareManager,
        LoggerInterface $logger
    ) {
        parent::__construct($appName, $request);
        $this->rootFolder = $rootFolder;
        $this->userSession = $userSession;
        $this->urlGenerator = $urlGenerator;
        $this->shareManager = $shareManager;
        $this->logger = $logger;
    }

    /**
     * Test endpoint to verify controller is working.
     *
     * @return JSONResponse
     */
    #[NoAdminRequired]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/slicer/test')]
    public function test(): JSONResponse
    {
        return new JSONResponse([
            'status' => 'ok',
            'message' => 'SlicerController is working',
            'timestamp' => time(),
        ]);
    }

    /**
     * Create a temporary public share link for exported STL file
     * Uses Nextcloud's native share system.
     *
     * @return JSONResponse
     */
    #[NoAdminRequired]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'POST', url: '/api/slicer/temp')]
    public function saveTempFile(): JSONResponse
    {
        try {
            $this->logger->info('SlicerController: saveTempFile called');

            // Check authentication
            $user = $this->userSession->getUser();
            if ($user === null) {
                $this->logger->error('SlicerController: User not authenticated');

                return new JSONResponse(['error' => 'User not authenticated'], Http::STATUS_UNAUTHORIZED);
            }

            $this->logger->info('SlicerController: User authenticated', ['user' => $user->getUID()]);

            // Enforce declared content-length before reading to avoid large allocations
            $contentLengthHeader = $this->request->getHeader('Content-Length');
            if (!empty($contentLengthHeader) && (int) $contentLengthHeader > self::MAX_UPLOAD_SIZE_BYTES) {
                $this->logger->warning('SlicerController: Upload rejected - Content-Length exceeds limit', [
                    'user' => $user->getUID(),
                    'contentLength' => (int) $contentLengthHeader,
                ]);

                return new JSONResponse(['error' => 'File too large'], Http::STATUS_BAD_REQUEST);
            }

            // Get the uploaded file data
            $fileData = file_get_contents('php://input');
            if ($fileData === false || empty($fileData)) {
                $this->logger->error('SlicerController: No file data in request');

                return new JSONResponse(['error' => 'No file data provided'], Http::STATUS_BAD_REQUEST);
            }

            $fileSize = strlen($fileData);
            if ($fileSize > self::MAX_UPLOAD_SIZE_BYTES) {
                $this->logger->warning('SlicerController: Upload rejected - size exceeds limit', [
                    'user' => $user->getUID(),
                    'size' => $fileSize,
                ]);

                return new JSONResponse(['error' => 'File too large'], Http::STATUS_BAD_REQUEST);
            }

            // Basic MIME/format validation to reduce unexpected content
            $finfo = new \finfo(FILEINFO_MIME_TYPE);
            $mimeType = $finfo->buffer($fileData) ?: 'application/octet-stream';

            // Get filename from query parameter (keeps original extension when allowed)
            $filename = $this->request->getParam('filename', 'model.stl');
            $filename = basename(str_replace('\\', '/', $filename));
            $filename = str_replace(['/', '\\'], '_', $filename);

            // Determine extension and sanitize
            $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));

            if (!$this->isValidUpload($mimeType, $fileData, $extension)) {
                $this->logger->warning('SlicerController: Upload rejected - invalid MIME/type', [
                    'user' => $user->getUID(),
                    'mime' => $mimeType,
                    'ext' => $extension,
                ]);

                return new JSONResponse(['error' => 'Invalid file type'], Http::STATUS_BAD_REQUEST);
            }

            $this->logger->info('SlicerController: Received file data', ['size' => $fileSize, 'mime' => $mimeType, 'ext' => $extension]);

            // Sanitize filename (remove invalid characters, keep dots and hyphens)
            $filename = preg_replace('/[^a-zA-Z0-9_\-\.]/', '_', $filename);

            // Remove multiple consecutive underscores
            $filename = preg_replace('/_+/', '_', $filename);

            // If extension not allowed, default to stl
            $allowedExtensions = $this->getAllowedExtensions();
            if (!in_array($extension, $allowedExtensions, true)) {
                $extension = 'stl';
                $filename .= '.stl';
            }

            // Get user folder
            $userFolder = $this->rootFolder->getUserFolder($user->getUID());
            $this->logger->info('SlicerController: Got user folder');

            // Create or get temp folder
            try {
                $tempFolder = $userFolder->get(self::TEMP_FOLDER);
                $this->logger->info('SlicerController: Found existing temp folder');
            } catch (\OCP\Files\NotFoundException $e) {
                $this->logger->info('SlicerController: Creating new temp folder');
                $tempFolder = $userFolder->newFolder(self::TEMP_FOLDER);
                $this->logger->info('SlicerController: Created temp folder');
            }

            // Clean up old files and shares
            $this->cleanupOldTempFiles($tempFolder);

            // Enforce rolling folder size cap
            $currentFolderSize = $this->getFolderSizeBytes($tempFolder);
            if ($currentFolderSize + $fileSize > self::MAX_TEMP_FOLDER_BYTES) {
                $this->logger->warning('SlicerController: Upload rejected - temp folder over cap', [
                    'user' => $user->getUID(),
                    'currentFolderSize' => $currentFolderSize,
                    'attemptedSize' => $fileSize,
                ]);

                return new JSONResponse(['error' => 'Temporary storage quota exceeded'], Http::STATUS_BAD_REQUEST);
            }

            // Generate unique filename with timestamp
            $uniqueFilename = time() . '_' . $filename;

            // Save the file
            $file = $tempFolder->newFile($uniqueFilename);
            $file->putContent($fileData);

            $this->logger->info('SlicerController: File saved', ['fileId' => $file->getId()]);

            // Create a temporary public share link (Nextcloud native way)
            $share = $this->shareManager->newShare();
            $share->setNode($file);
            $share->setShareType(IShare::TYPE_LINK);
            $share->setSharedBy($user->getUID());
            $share->setPermissions(\OCP\Constants::PERMISSION_READ);

            // Set rolling 24h expiration
            $expirationDate = (new \DateTimeImmutable())->modify('+1 day');
            $share->setExpirationDate(\DateTime::createFromImmutable($expirationDate));

            // Create the share
            $share = $this->shareManager->createShare($share);
            $token = $share->getToken();

            $this->logger->info('SlicerController: Share created', ['token' => $token]);

            // Generate public download URL using the share token
            // Add filename as query parameter so slicers recognize the file type
            $downloadUrl = $this->urlGenerator->linkToRouteAbsolute(
                'files_sharing.sharecontroller.downloadShare',
                ['token' => $token]
            ) . '?filename=' . urlencode($uniqueFilename);

            $this->logger->info('Temporary STL file shared for slicer', [
                'user' => $user->getUID(),
                'filename' => $uniqueFilename,
                'size' => $file->getSize(),
                'fileId' => $file->getId(),
                'shareToken' => $token,
                'downloadUrl' => $downloadUrl,
            ]);

            return new JSONResponse([
                'success' => true,
                'fileId' => $file->getId(),
                'shareToken' => $token,
                'downloadUrl' => $downloadUrl,
                'filename' => $uniqueFilename,
                'size' => $file->getSize(),
                'expiresAt' => $expirationDate->format('c'),
            ]);
        } catch (\Throwable $e) {
            $this->logger->error('Failed to save temporary STL file', [
                'error' => $e->getMessage(),
                'type' => get_class($e),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString(),
            ]);

            return new JSONResponse([
                'error' => 'Failed to save file: ' . $e->getMessage(),
                'details' => get_class($e),
            ], Http::STATUS_INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get temporary file for download.
     *
     * @NoAdminRequired
     * @NoCSRFRequired
     * @param int $fileId File ID
     * @return Http\DataDownloadResponse|JSONResponse
     */
    #[NoAdminRequired]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/slicer/temp/{fileId}')]
    public function getTempFile(int $fileId)
    {
        try {
            // Check authentication
            $user = $this->userSession->getUser();
            if ($user === null) {
                return new JSONResponse(['error' => 'User not authenticated'], Http::STATUS_UNAUTHORIZED);
            }

            // Get user folder
            $userFolder = $this->rootFolder->getUserFolder($user->getUID());

            // Get file by ID
            $files = $userFolder->getById($fileId);

            if (empty($files)) {
                return new JSONResponse(['error' => 'File not found'], Http::STATUS_NOT_FOUND);
            }

            $file = $files[0];

            // Verify file is in temp folder using secure path validation
            try {
                $tempFolder = $userFolder->get(self::TEMP_FOLDER);
                $tempFolderPath = $tempFolder->getPath();
                $filePath = $file->getPath();

                // Ensure the file path starts with the temp folder path followed by a separator
                if (!str_starts_with($filePath, $tempFolderPath . '/')) {
                    return new JSONResponse(['error' => 'Access denied'], Http::STATUS_FORBIDDEN);
                }
            } catch (\Exception $e) {
                return new JSONResponse(['error' => 'Access denied'], Http::STATUS_FORBIDDEN);
            }

            // Enforce rolling 24h age on access
            $age = time() - $file->getMTime();
            if ($age > self::MAX_TEMP_FILE_AGE) {
                // Delete shares first
                $shares = $this->shareManager->getSharesBy($user->getUID(), IShare::TYPE_LINK, $file, false, -1, 0);
                foreach ($shares as $share) {
                    $this->shareManager->deleteShare($share);
                }
                $file->delete();
                $this->logger->info('Temporary STL file expired and removed on access', [
                    'user' => $user->getUID(),
                    'fileId' => $fileId,
                    'age' => $age,
                ]);

                return new JSONResponse(['error' => 'File expired'], Http::STATUS_GONE);
            }

            // Get file content
            $content = $file->getContent();

            $this->logger->info('Temporary STL file downloaded', [
                'user' => $user->getUID(),
                'fileId' => $fileId,
                'filename' => $file->getName(),
            ]);

            // Return file as download
            $response = new Http\DataDownloadResponse(
                $content,
                $file->getName(),
                'application/octet-stream'
            );

            // Add headers for slicer apps
            $response->addHeader('Content-Length', (string) strlen($content));
            $response->addHeader('Access-Control-Allow-Origin', '*');
            $response->addHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

            return $response;
        } catch (\Throwable $e) {
            $this->logger->error('Failed to get temporary STL file', [
                'fileId' => $fileId,
                'error' => $e->getMessage(),
            ]);

            return new JSONResponse([
                'error' => 'Failed to get file: ' . $e->getMessage(),
            ], Http::STATUS_INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Delete temporary file and its share.
     *
     * @NoAdminRequired
     * @NoCSRFRequired
     * @param int $fileId File ID to delete
     * @return JSONResponse
     */
    #[NoAdminRequired]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'DELETE', url: '/api/slicer/temp/{fileId}')]
    public function deleteTempFile(int $fileId): JSONResponse
    {
        try {
            // Check authentication
            $user = $this->userSession->getUser();
            if ($user === null) {
                return new JSONResponse(['error' => 'User not authenticated'], Http::STATUS_UNAUTHORIZED);
            }

            // Get user folder
            $userFolder = $this->rootFolder->getUserFolder($user->getUID());

            // Get file by ID
            $files = $userFolder->getById($fileId);

            if (empty($files)) {
                return new JSONResponse(['success' => true]); // Already deleted
            }

            $file = $files[0];

            // Verify file is in temp folder using secure path validation
            try {
                $tempFolder = $userFolder->get(self::TEMP_FOLDER);
                $tempFolderPath = $tempFolder->getPath();
                $filePath = $file->getPath();

                // Ensure the file path starts with the temp folder path followed by a separator
                if (!str_starts_with($filePath, $tempFolderPath . '/')) {
                    return new JSONResponse(['error' => 'Access denied'], Http::STATUS_FORBIDDEN);
                }
            } catch (\Exception $e) {
                return new JSONResponse(['error' => 'Access denied'], Http::STATUS_FORBIDDEN);
            }

            // Delete all shares for this file
            $shares = $this->shareManager->getSharesBy($user->getUID(), IShare::TYPE_LINK, $file, false, -1, 0);
            foreach ($shares as $share) {
                $this->shareManager->deleteShare($share);
                $this->logger->debug('Deleted share', ['token' => $share->getToken()]);
            }

            // Delete the file
            $file->delete();

            $this->logger->info('Temporary STL file and shares deleted', [
                'user' => $user->getUID(),
                'fileId' => $fileId,
                'sharesDeleted' => count($shares),
            ]);

            return new JSONResponse(['success' => true]);
        } catch (\Throwable $e) {
            $this->logger->error('Failed to delete temporary STL file', [
                'fileId' => $fileId,
                'error' => $e->getMessage(),
            ]);

            return new JSONResponse([
                'error' => 'Failed to delete file: ' . $e->getMessage(),
            ], Http::STATUS_INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Clean up old temporary files and their shares.
     *
     * @param mixed $tempFolder
     * @return void
     */
    private function cleanupOldTempFiles($tempFolder): void
    {
        try {
            $now = time();
            $files = $tempFolder->getDirectoryListing();
            $user = $this->userSession->getUser();

            foreach ($files as $file) {
                // Delete files older than MAX_TEMP_FILE_AGE
                $age = $now - $file->getMTime();
                if ($age > self::MAX_TEMP_FILE_AGE) {
                    // Delete shares first
                    if ($user) {
                        $shares = $this->shareManager->getSharesBy($user->getUID(), IShare::TYPE_LINK, $file, false, -1, 0);
                        foreach ($shares as $share) {
                            $this->shareManager->deleteShare($share);
                        }
                    }

                    // Delete the file
                    $file->delete();
                    $this->logger->debug('Cleaned up old temp file', [
                        'filename' => $file->getName(),
                        'age' => $age,
                    ]);
                }
            }
        } catch (\Throwable $e) {
            // Log but don't fail the request
            $this->logger->warning('Failed to cleanup old temp files', [
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Calculate folder size in bytes.
     */
    private function getFolderSizeBytes($folder): int
    {
        $total = 0;
        foreach ($folder->getDirectoryListing() as $file) {
            $total += $file->getSize();
        }

        return $total;
    }

    /**
     * Allowed slicer upload extensions.
     */
    private function getAllowedExtensions(): array
    {
        return ['stl', 'gcode', 'gco', 'nc', 'g', 'gx', '3mf', 'amf'];
    }

    /**
     * Basic upload validation using MIME sniff + extension check.
     */
    private function isValidUpload(string $mime, string $data, string $extension): bool
    {
        $extension = strtolower($extension);
        $allowedExt = $this->getAllowedExtensions();
        if (!in_array($extension, $allowedExt, true)) {
            return false;
        }

        $mime = strtolower($mime);
        $allowedMime = [
            // STL
            'model/stl',
            'application/sla',
            'application/octet-stream',
            // G-code (often text/plain or octet-stream)
            'text/plain',
            'application/gcode',
            // 3MF/AMF
            'application/vnd.ms-package.3dmanufacturing-3dmodel',
            'model/amf',
        ];

        if (in_array($mime, $allowedMime, true)) {
            return true;
        }

        // Fallback heuristics
        if ($extension === 'stl') {
            $trimmed = ltrim(substr($data, 0, 80));
            if (stripos($trimmed, 'solid ') === 0) {
                return true;
            }
            return true; // binary STL already allowed via octet-stream
        }

        if (in_array($extension, ['gcode', 'gco', 'nc', 'g', 'gx'], true)) {
            // G-code is text; ensure it contains movement commands
            $snippet = strtolower(substr($data, 0, 2000));
            return str_contains($snippet, 'g0') || str_contains($snippet, 'g1');
        }

        return true; // Accept remaining allowed extensions with mime fallback
    }
}
