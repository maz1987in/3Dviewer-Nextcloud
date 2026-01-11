<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use Psr\Log\LoggerInterface;

/**
 * Service for storing and retrieving 3D model thumbnails.
 * 
 * Thumbnails are stored in .3dviewer_thumbnails folder in user's home directory.
 * Follows the same pattern as .3dviewer_temp for slicer integration.
 */
class ThumbnailService
{
    private const THUMBNAIL_FOLDER = '.3dviewer_thumbnails';
    private const MAX_THUMBNAIL_SIZE_BYTES = 1024 * 1024; // 1MB max per thumbnail

    public function __construct(
        private readonly IRootFolder $rootFolder,
        private readonly LoggerInterface $logger,
    ) {
    }

    /**
     * Store a thumbnail for a file.
     * 
     * @param int $fileId The file ID to store thumbnail for
     * @param string $userId The user ID
     * @param string $imageData The image data (binary content)
     * @return bool True if stored successfully, false otherwise
     */
    public function storeThumbnail(int $fileId, string $userId, string $imageData): bool
    {
        try {
            // Validate image size
            $imageSize = strlen($imageData);
            if ($imageSize > self::MAX_THUMBNAIL_SIZE_BYTES) {
                $this->logger->warning('ThumbnailService: Thumbnail too large', [
                    'fileId' => $fileId,
                    'userId' => $userId,
                    'size' => $imageSize,
                    'maxSize' => self::MAX_THUMBNAIL_SIZE_BYTES,
                ]);
                return false;
            }

            // Validate image data (basic PNG/JPEG header check)
            if (!$this->isValidImageData($imageData)) {
                $this->logger->warning('ThumbnailService: Invalid image data', [
                    'fileId' => $fileId,
                    'userId' => $userId,
                ]);
                return false;
            }

            // Get user folder
            $userFolder = $this->rootFolder->getUserFolder($userId);

            // Create or get thumbnail folder
            try {
                $thumbnailFolder = $userFolder->get(self::THUMBNAIL_FOLDER);
            } catch (NotFoundException $e) {
                $thumbnailFolder = $userFolder->newFolder(self::THUMBNAIL_FOLDER);
                $this->logger->info('ThumbnailService: Created thumbnail folder', ['userId' => $userId]);
            }

            // Determine file extension based on image data
            $extension = $this->getImageExtension($imageData);
            $filename = (string)$fileId . '.' . $extension;

            // Save or update thumbnail
            try {
                $thumbnailFile = $thumbnailFolder->get($filename);
                $thumbnailFile->putContent($imageData);
            } catch (NotFoundException $e) {
                $thumbnailFile = $thumbnailFolder->newFile($filename);
                $thumbnailFile->putContent($imageData);
            }

            $this->logger->info('ThumbnailService: Thumbnail stored', [
                'fileId' => $fileId,
                'userId' => $userId,
                'filename' => $filename,
                'size' => $imageSize,
            ]);

            return true;
        } catch (\Throwable $e) {
            $this->logger->error('ThumbnailService: Failed to store thumbnail', [
                'fileId' => $fileId,
                'userId' => $userId,
                'error' => $e->getMessage(),
            ]);
            return false;
        }
    }

    /**
     * Get the thumbnail file content if it exists.
     * 
     * @param int $fileId The file ID
     * @param string $userId The user ID
     * @return string|null The thumbnail file content, or null if not found
     */
    public function getThumbnailContent(int $fileId, string $userId): ?string
    {
        try {
            $userFolder = $this->rootFolder->getUserFolder($userId);

            try {
                $thumbnailFolder = $userFolder->get(self::THUMBNAIL_FOLDER);
            } catch (NotFoundException $e) {
                return null;
            }

            // Try both PNG and JPEG extensions
            foreach (['png', 'jpg', 'jpeg'] as $ext) {
                $filename = (string)$fileId . '.' . $ext;
                try {
                    $thumbnailFile = $thumbnailFolder->get($filename);
                    return $thumbnailFile->getContent();
                } catch (NotFoundException $e) {
                    continue;
                }
            }

            return null;
        } catch (\Throwable $e) {
            $this->logger->error('ThumbnailService: Failed to get thumbnail content', [
                'fileId' => $fileId,
                'userId' => $userId,
                'error' => $e->getMessage(),
            ]);
            return null;
        }
    }

    /**
     * Get the local filesystem path to a thumbnail file if it exists.
     * This is used by preview providers that need a file path.
     * 
     * @param int $fileId The file ID
     * @param string $userId The user ID
     * @return string|null The local thumbnail file path, or null if not found
     */
    public function getThumbnailPath(int $fileId, string $userId): ?string
    {
        try {
            $userFolder = $this->rootFolder->getUserFolder($userId);

            try {
                $thumbnailFolder = $userFolder->get(self::THUMBNAIL_FOLDER);
            } catch (NotFoundException $e) {
                return null;
            }

            // Try both PNG and JPEG extensions
            foreach (['png', 'jpg', 'jpeg'] as $ext) {
                $filename = (string)$fileId . '.' . $ext;
                try {
                    $thumbnailFile = $thumbnailFolder->get($filename);
                    $storage = $thumbnailFile->getStorage();
                    if (method_exists($storage, 'getLocalFile')) {
                        return $storage->getLocalFile($thumbnailFile->getInternalPath());
                    }
                    // Fallback: if we can't get local path, return null
                    // Preview provider will need to use content instead
                    return null;
                } catch (NotFoundException $e) {
                    continue;
                }
            }

            return null;
        } catch (\Throwable $e) {
            $this->logger->error('ThumbnailService: Failed to get thumbnail path', [
                'fileId' => $fileId,
                'userId' => $userId,
                'error' => $e->getMessage(),
            ]);
            return null;
        }
    }

    /**
     * Check if a thumbnail exists for a file.
     * 
     * @param int $fileId The file ID
     * @param string $userId The user ID
     * @return bool True if thumbnail exists, false otherwise
     */
    public function hasThumbnail(int $fileId, string $userId): bool
    {
        return $this->getThumbnailContent($fileId, $userId) !== null;
    }

    /**
     * Delete a thumbnail for a file.
     * 
     * @param int $fileId The file ID
     * @param string $userId The user ID
     * @return void
     */
    public function deleteThumbnail(int $fileId, string $userId): void
    {
        try {
            $userFolder = $this->rootFolder->getUserFolder($userId);

            try {
                $thumbnailFolder = $userFolder->get(self::THUMBNAIL_FOLDER);
            } catch (NotFoundException $e) {
                return;
            }

            // Try to delete with different extensions
            foreach (['png', 'jpg', 'jpeg'] as $ext) {
                $filename = (string)$fileId . '.' . $ext;
                try {
                    $thumbnailFile = $thumbnailFolder->get($filename);
                    $thumbnailFile->delete();
                    $this->logger->info('ThumbnailService: Thumbnail deleted', [
                        'fileId' => $fileId,
                        'userId' => $userId,
                        'filename' => $filename,
                    ]);
                    break;
                } catch (NotFoundException $e) {
                    continue;
                }
            }
        } catch (\Throwable $e) {
            $this->logger->error('ThumbnailService: Failed to delete thumbnail', [
                'fileId' => $fileId,
                'userId' => $userId,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Validate image data by checking headers.
     * 
     * @param string $imageData The image data
     * @return bool True if valid PNG or JPEG, false otherwise
     */
    private function isValidImageData(string $imageData): bool
    {
        if (strlen($imageData) < 8) {
            return false;
        }

        // Check PNG signature: 89 50 4E 47 0D 0A 1A 0A
        if (substr($imageData, 0, 8) === "\x89\x50\x4E\x47\x0D\x0A\x1A\x0A") {
            return true;
        }

        // Check JPEG signature: FF D8 FF
        if (substr($imageData, 0, 3) === "\xFF\xD8\xFF") {
            return true;
        }

        return false;
    }

    /**
     * Get image file extension based on image data.
     * 
     * @param string $imageData The image data
     * @return string The file extension (png, jpg, or jpeg)
     */
    private function getImageExtension(string $imageData): string
    {
        // Check PNG signature
        if (substr($imageData, 0, 8) === "\x89\x50\x4E\x47\x0D\x0A\x1A\x0A") {
            return 'png';
        }

        // Default to jpeg for JPEG
        return 'jpg';
    }
}
