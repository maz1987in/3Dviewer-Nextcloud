<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCP\Files\IAppData;
use OCP\Files\NotFoundException;
use OCP\Files\SimpleFS\ISimpleFolder;
use Psr\Log\LoggerInterface;

/**
 * Read-only access to the pre-3.6 private annotation documents.
 *
 * Before 3.6 each user's annotations for a model were kept in app data under
 * `annotations/{userId}/{fileId}.json`. Shared notes replaced them; this class now exists
 * only so NotesService::migrateLegacy() can read a document and remove it once moved.
 */
class AnnotationsService
{
    private const ANNOTATIONS_FOLDER = 'annotations';

    public function __construct(
        private readonly IAppData $appData,
        private readonly LoggerInterface $logger,
    ) {
    }

    /**
     * Load the saved annotation document for a (user, file) pair.
     *
     * @return string|null Raw JSON string, or null if nothing has been saved
     */
    public function load(int $fileId, string $userId): ?string
    {
        try {
            $userFolder = $this->getUserFolder($userId);
            if ($userFolder === null) {
                return null;
            }

            $filename = $this->buildFilename($fileId);

            try {
                return $userFolder->getFile($filename)->getContent();
            } catch (NotFoundException $e) {
                return null;
            }
        } catch (\Throwable $e) {
            $this->logger->error('AnnotationsService: Failed to load annotations', [
                'fileId' => $fileId,
                'userId' => $userId,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    /**
     * Delete the annotation document for a (user, file) pair, if any.
     */
    public function delete(int $fileId, string $userId): bool
    {
        try {
            $userFolder = $this->getUserFolder($userId);
            if ($userFolder === null) {
                return true;
            }

            $filename = $this->buildFilename($fileId);

            try {
                $userFolder->getFile($filename)->delete();
                $this->logger->info('AnnotationsService: Annotations deleted', [
                    'fileId' => $fileId,
                    'userId' => $userId,
                ]);

                return true;
            } catch (NotFoundException $e) {
                // Nothing to delete — treat as success
                return true;
            }
        } catch (\Throwable $e) {
            $this->logger->error('AnnotationsService: Failed to delete annotations', [
                'fileId' => $fileId,
                'userId' => $userId,
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }

    private function buildFilename(int $fileId): string
    {
        return $fileId . '.json';
    }

    private function getUserFolder(string $userId): ?ISimpleFolder
    {
        try {
            $root = $this->appData->getFolder(self::ANNOTATIONS_FOLDER);

            return $root->getFolder($userId);
        } catch (NotFoundException $e) {
            return null;
        }
    }
}
