<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCP\Files\IAppData;
use OCP\Files\NotFoundException;
use OCP\Files\NotPermittedException;
use OCP\Files\SimpleFS\ISimpleFolder;
use Psr\Log\LoggerInterface;

/**
 * Persistent storage for per-file annotation documents.
 *
 * Annotations are kept in the app's private storage (IAppData) under
 * `annotations/{userId}/{fileId}.json`. Storing them in app data — instead of
 * a sidecar file next to the model — keeps the user's file tree clean and
 * avoids needing write permissions in shared folders.
 *
 * Each blob is the same JSON document that the client's `exportAsJSON()`
 * already produces (`format`, `version`, `exportedAt`, `modelFilename`,
 * `annotations[]`), so the export/import flow and the auto-persistence flow
 * share a single schema.
 */
class AnnotationsService
{
    private const ANNOTATIONS_FOLDER = 'annotations';

    /** Hard cap so a runaway client can't fill app data with multi-MB blobs. */
    public const MAX_PAYLOAD_BYTES = 256 * 1024;

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
     * Persist the annotation document for a (user, file) pair.
     *
     * Caller is responsible for validating that $payload is well-formed JSON
     * and matches the expected schema. This method only enforces the size cap.
     *
     * @return bool true on success
     */
    public function save(int $fileId, string $userId, string $payload): bool
    {
        $size = strlen($payload);
        if ($size > self::MAX_PAYLOAD_BYTES) {
            $this->logger->warning('AnnotationsService: Payload exceeds limit', [
                'fileId' => $fileId,
                'userId' => $userId,
                'size' => $size,
                'maxSize' => self::MAX_PAYLOAD_BYTES,
            ]);

            return false;
        }

        try {
            $userFolder = $this->getOrCreateUserFolder($userId);
            $filename = $this->buildFilename($fileId);

            try {
                $file = $userFolder->getFile($filename);
                $file->putContent($payload);
            } catch (NotFoundException $e) {
                $file = $userFolder->newFile($filename);
                $file->putContent($payload);
            }

            $this->logger->info('AnnotationsService: Annotations saved', [
                'fileId' => $fileId,
                'userId' => $userId,
                'size' => $size,
            ]);

            return true;
        } catch (\Throwable $e) {
            $this->logger->error('AnnotationsService: Failed to save annotations', [
                'fileId' => $fileId,
                'userId' => $userId,
                'error' => $e->getMessage(),
            ]);

            return false;
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

    /**
     * @throws NotPermittedException If folder creation fails
     */
    private function getOrCreateUserFolder(string $userId): ISimpleFolder
    {
        try {
            $root = $this->appData->getFolder(self::ANNOTATIONS_FOLDER);
        } catch (NotFoundException $e) {
            $root = $this->appData->newFolder(self::ANNOTATIONS_FOLDER);
            $this->logger->info('AnnotationsService: Created annotations folder in app data');
        }

        try {
            return $root->getFolder($userId);
        } catch (NotFoundException $e) {
            $userFolder = $root->newFolder($userId);
            $this->logger->info('AnnotationsService: Created user annotations folder', ['userId' => $userId]);

            return $userFolder;
        }
    }
}
