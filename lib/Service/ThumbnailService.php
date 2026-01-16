<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCP\Files\IAppData;
use OCP\Files\NotFoundException;
use OCP\Files\NotPermittedException;
use Psr\Log\LoggerInterface;

/**
 * Service for storing and retrieving 3D model thumbnails.
 * 
 * Thumbnails are stored in Nextcloud's app data folder (not in user files).
 * This prevents thumbnails from appearing in user's file list or recent files.
 */
class ThumbnailService
{
    private const THUMBNAILS_FOLDER = 'thumbnails';
    private const MAX_THUMBNAIL_SIZE_BYTES = 1024 * 1024; // 1MB max per thumbnail

    public function __construct(
        private readonly IAppData $appData,
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

            // Get or create user's thumbnail folder in app data
            $userFolder = $this->getOrCreateUserFolder($userId);
            
            // Determine file extension based on image data
            $extension = $this->getImageExtension($imageData);
            $filename = (string)$fileId . '.' . $extension;

            // Delete existing thumbnail with different extension if exists
            foreach (['png', 'jpg', 'jpeg'] as $ext) {
                if ($ext !== $extension) {
                    $oldFilename = (string)$fileId . '.' . $ext;
                    try {
                        $oldFile = $userFolder->getFile($oldFilename);
                        $oldFile->delete();
                    } catch (NotFoundException $e) {
                        // File doesn't exist, ignore
                    }
                }
            }

            // Save or update thumbnail
            try {
                $thumbnailFile = $userFolder->getFile($filename);
                $thumbnailFile->putContent($imageData);
            } catch (NotFoundException $e) {
                $thumbnailFile = $userFolder->newFile($filename);
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
            $userFolder = $this->getUserFolder($userId);
            if ($userFolder === null) {
                return null;
            }

            // Try both PNG and JPEG extensions
            foreach (['png', 'jpg', 'jpeg'] as $ext) {
                $filename = (string)$fileId . '.' . $ext;
                try {
                    $thumbnailFile = $userFolder->getFile($filename);
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
     * Note: IAppData doesn't expose local paths, so this returns null.
     * Use getThumbnailContent() instead.
     * 
     * @param int $fileId The file ID
     * @param string $userId The user ID
     * @return string|null Always returns null for app data storage
     */
    public function getThumbnailPath(int $fileId, string $userId): ?string
    {
        // IAppData doesn't expose local filesystem paths
        // Preview providers should use getThumbnailContent() instead
        return null;
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
        try {
            $userFolder = $this->getUserFolder($userId);
            if ($userFolder === null) {
                return false;
            }

            // Try both PNG and JPEG extensions
            foreach (['png', 'jpg', 'jpeg'] as $ext) {
                $filename = (string)$fileId . '.' . $ext;
                try {
                    $userFolder->getFile($filename);
                    return true;
                } catch (NotFoundException $e) {
                    continue;
                }
            }

            return false;
        } catch (\Throwable $e) {
            return false;
        }
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
            $userFolder = $this->getUserFolder($userId);
            if ($userFolder === null) {
                return;
            }

            // Try to delete with different extensions
            foreach (['png', 'jpg', 'jpeg'] as $ext) {
                $filename = (string)$fileId . '.' . $ext;
                try {
                    $thumbnailFile = $userFolder->getFile($filename);
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
     * Delete all thumbnails for a user.
     * 
     * @param string $userId The user ID
     * @return int Number of thumbnails deleted
     */
    public function clearAllThumbnails(string $userId): int
    {
        $deletedCount = 0;
        
        try {
            $userFolder = $this->getUserFolder($userId);
            if ($userFolder === null) {
                $this->logger->info('ThumbnailService: No thumbnail folder found for user', ['userId' => $userId]);
                return 0;
            }

            // Get all files in the user's thumbnail folder
            $files = $userFolder->getDirectoryListing();
            
            foreach ($files as $file) {
                try {
                    $file->delete();
                    $deletedCount++;
                } catch (\Throwable $e) {
                    $this->logger->warning('ThumbnailService: Failed to delete thumbnail file', [
                        'userId' => $userId,
                        'filename' => $file->getName(),
                        'error' => $e->getMessage(),
                    ]);
                }
            }

            $this->logger->info('ThumbnailService: Cleared all thumbnails for user', [
                'userId' => $userId,
                'deletedCount' => $deletedCount,
            ]);

            return $deletedCount;
        } catch (\Throwable $e) {
            $this->logger->error('ThumbnailService: Failed to clear thumbnails', [
                'userId' => $userId,
                'error' => $e->getMessage(),
            ]);
            return $deletedCount;
        }
    }

    /**
     * Get the user's thumbnail folder from app data.
     * 
     * @param string $userId The user ID
     * @return \OCP\Files\SimpleFS\ISimpleFolder|null The folder or null if not found
     */
    private function getUserFolder(string $userId): ?\OCP\Files\SimpleFS\ISimpleFolder
    {
        try {
            $thumbnailsFolder = $this->appData->getFolder(self::THUMBNAILS_FOLDER);
            return $thumbnailsFolder->getFolder($userId);
        } catch (NotFoundException $e) {
            return null;
        }
    }

    /**
     * Get or create the user's thumbnail folder from app data.
     * 
     * @param string $userId The user ID
     * @return \OCP\Files\SimpleFS\ISimpleFolder The folder
     * @throws NotPermittedException If folder creation fails
     */
    private function getOrCreateUserFolder(string $userId): \OCP\Files\SimpleFS\ISimpleFolder
    {
        try {
            $thumbnailsFolder = $this->appData->getFolder(self::THUMBNAILS_FOLDER);
        } catch (NotFoundException $e) {
            $thumbnailsFolder = $this->appData->newFolder(self::THUMBNAILS_FOLDER);
            $this->logger->info('ThumbnailService: Created thumbnails folder in app data');
        }

        try {
            return $thumbnailsFolder->getFolder($userId);
        } catch (NotFoundException $e) {
            $userFolder = $thumbnailsFolder->newFolder($userId);
            $this->logger->info('ThumbnailService: Created user thumbnail folder', ['userId' => $userId]);
            return $userFolder;
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
