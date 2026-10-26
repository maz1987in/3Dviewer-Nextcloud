<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCP\Files\IAppData;
use OCP\Files\NotFoundException;
use OCP\Files\SimpleFS\ISimpleFolder;
use Psr\Log\LoggerInterface;

/**
 * Stores one PNG thumbnail per file version, shared by everyone who can read the file.
 *
 * Thumbnails live in Nextcloud's app data (not in user files), so they never show up in a
 * file list or in recents. Layout: `thumbnails-v2/<fileId>/<sha1(etag)>.png`. The ETag
 * changes whenever the file's content does, so a stale thumbnail can never be served for
 * a new version; the first thumbnail stored for a version is kept.
 */
class ThumbnailService
{
    public const MAX_BYTES = 1048576;

    private const ROOT_FOLDER = 'thumbnails-v2';
    private const MIN_SIDE = 16;
    private const MAX_SIDE = 1024;

    public function __construct(
        private readonly IAppData $appData,
        private readonly LoggerInterface $logger,
    ) {
    }

    /**
     * Store the thumbnail for one version of a file.
     *
     * @param string $etag The file's ETag, which identifies the version
     * @param string $png Raw PNG bytes
     * @throws \Throwable If the app data is not writable; the caller decides how to report it
     */
    public function store(int $fileId, string $etag, string $png): ThumbnailStoreResult
    {
        if (!$this->isAcceptablePng($png)) {
            $this->logger->warning('ThumbnailService: Rejected thumbnail', [
                'fileId' => $fileId,
                'size' => strlen($png),
            ]);

            return ThumbnailStoreResult::InvalidImage;
        }

        $folder = $this->ensureFileFolder($fileId);
        $name = $this->fileName($etag);

        if ($folder->fileExists($name)) {
            return ThumbnailStoreResult::Exists;
        }

        try {
            $folder->newFile($name, $png);
        } catch (\Throwable $e) {
            // A concurrent request for the same version may have written it between the check and now.
            if ($folder->fileExists($name)) {
                return ThumbnailStoreResult::Exists;
            }

            throw $e;
        }

        $this->logger->info('ThumbnailService: Thumbnail stored', [
            'fileId' => $fileId,
            'size' => strlen($png),
        ]);

        return ThumbnailStoreResult::Stored;
    }

    public function has(int $fileId, string $etag): bool
    {
        $folder = $this->findFileFolder($fileId);

        return $folder !== null && $folder->fileExists($this->fileName($etag));
    }

    /**
     * @return string|null The PNG bytes, or null if no thumbnail exists for this version
     */
    public function get(int $fileId, string $etag): ?string
    {
        $folder = $this->findFileFolder($fileId);
        if ($folder === null) {
            return null;
        }

        try {
            return $folder->getFile($this->fileName($etag))->getContent();
        } catch (NotFoundException) {
            return null;
        }
    }

    /**
     * Delete every stored version of a file's thumbnail.
     */
    public function deleteAll(int $fileId): void
    {
        $folder = $this->findFileFolder($fileId);
        if ($folder === null) {
            return;
        }

        $folder->delete();

        $this->logger->info('ThumbnailService: Thumbnails deleted', ['fileId' => $fileId]);
    }

    private function fileName(string $etag): string
    {
        return sha1($etag) . '.png';
    }

    /**
     * A PNG within the size cap whose sides are each within the accepted range.
     */
    private function isAcceptablePng(string $data): bool
    {
        if ($data === '' || strlen($data) > self::MAX_BYTES) {
            return false;
        }

        $info = @getimagesizefromstring($data);
        if ($info === false || $info[2] !== IMAGETYPE_PNG) {
            return false;
        }

        foreach ([$info[0], $info[1]] as $side) {
            if ($side < self::MIN_SIDE || $side > self::MAX_SIDE) {
                return false;
            }
        }

        return true;
    }

    /**
     * The folder holding one file's thumbnails, or null for a file with none.
     */
    private function findFileFolder(int $fileId): ?ISimpleFolder
    {
        try {
            return $this->appData->getFolder(self::ROOT_FOLDER)->getFolder((string) $fileId);
        } catch (NotFoundException) {
            return null;
        }
    }

    /**
     * The folder holding one file's thumbnails, created when missing.
     */
    private function ensureFileFolder(int $fileId): ISimpleFolder
    {
        $root = $this->getOrCreateFolder(
            fn (): ISimpleFolder => $this->appData->getFolder(self::ROOT_FOLDER),
            fn (): ISimpleFolder => $this->appData->newFolder(self::ROOT_FOLDER),
        );

        return $this->getOrCreateFolder(
            fn (): ISimpleFolder => $root->getFolder((string) $fileId),
            fn (): ISimpleFolder => $root->newFolder((string) $fileId),
        );
    }

    /**
     * Get a folder, creating it when missing. Bulk first uploads race to create the same
     * folder, so a failed create is retried as a get: if the other request won, we use its folder.
     *
     * @param callable(): ISimpleFolder $get
     * @param callable(): ISimpleFolder $create
     */
    private function getOrCreateFolder(callable $get, callable $create): ISimpleFolder
    {
        try {
            return $get();
        } catch (NotFoundException) {
            try {
                return $create();
            } catch (\Throwable $e) {
                try {
                    return $get();
                } catch (NotFoundException) {
                    throw $e;
                }
            }
        }
    }
}
