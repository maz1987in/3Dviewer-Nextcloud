<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use DateTime;
use OCA\ThreeDViewer\Db\FileIndex;
use OCA\ThreeDViewer\Db\FileIndexMapper;
use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\ICache;
use OCP\ICacheFactory;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;

class FileIndexService
{
    private const PROGRESS_CACHE_NS = 'threedviewer-index-progress';
    private const PROGRESS_TTL = 3600; // 1 hour

    private ?ICache $progressCache = null;

    public function __construct(
        private readonly FileIndexMapper $fileIndexMapper,
        private readonly IRootFolder $rootFolder,
        private readonly IUserSession $userSession,
        private readonly ModelFileSupport $modelFileSupport,
        private readonly ICacheFactory $cacheFactory,
        private readonly LoggerInterface $logger,
    ) {
    }

    private function getProgressCache(): ICache
    {
        if ($this->progressCache === null) {
            $this->progressCache = $this->cacheFactory->createDistributed(self::PROGRESS_CACHE_NS);
        }

        return $this->progressCache;
    }

    /**
     * Get indexing progress for the given user.
     *
     * @return array{active: bool, processed: int, total: int, percent: int, startedAt: ?int, updatedAt: ?int}
     */
    public function getIndexProgress(string $userId): array
    {
        $raw = $this->getProgressCache()->get($userId);
        if (!is_array($raw)) {
            return [
                'active' => false,
                'processed' => 0,
                'total' => 0,
                'percent' => 0,
                'startedAt' => null,
                'updatedAt' => null,
            ];
        }
        $total = max(0, (int) ($raw['total'] ?? 0));
        $processed = max(0, (int) ($raw['processed'] ?? 0));
        $percent = $total > 0 ? (int) floor(min(100, ($processed / $total) * 100)) : 0;

        return [
            'active' => (bool) ($raw['active'] ?? false),
            'processed' => $processed,
            'total' => $total,
            'percent' => $percent,
            'startedAt' => isset($raw['startedAt']) ? (int) $raw['startedAt'] : null,
            'updatedAt' => isset($raw['updatedAt']) ? (int) $raw['updatedAt'] : null,
        ];
    }

    private function setProgress(string $userId, array $data): void
    {
        $this->getProgressCache()->set($userId, $data, self::PROGRESS_TTL);
    }

    private function clearProgress(string $userId): void
    {
        $this->getProgressCache()->remove($userId);
    }

    /**
     * Index a file.
     */
    public function indexFile(File $file, string $userId): void
    {
        try {
            $extension = strtolower($file->getExtension());
            if (!$this->modelFileSupport->isSupported($extension)) {
                return;
            }

            // Check if already indexed
            $existing = $this->fileIndexMapper->getByFileId($file->getId(), $userId);
            $fileIndex = $existing ?? new FileIndex();

            // Extract folder path
            $path = $file->getPath();
            $userFolder = $this->rootFolder->getUserFolder($userId);
            $userFolderPath = $userFolder->getPath();

            // Remove user folder path from file path to get relative path
            if (str_starts_with($path, $userFolderPath)) {
                // Handle trailing slash in user folder path if present
                $prefixLength = strlen($userFolderPath);
                if (!str_ends_with($userFolderPath, '/')) {
                    $prefixLength++; // Account for the slash separator
                }
                $relativePath = substr($path, $prefixLength);
            } else {
                $relativePath = $path;
            }

            // Extract folder path (parent directory)
            $pathParts = explode('/', $relativePath);
            array_pop($pathParts); // Remove filename
            $folderPath = !empty($pathParts) ? implode('/', $pathParts) : '';

            // Extract year and month from mtime
            $mtime = $file->getMTime();
            $dateTime = new DateTime('@' . $mtime);
            $year = (int) $dateTime->format('Y');
            $month = (int) $dateTime->format('n'); // 1-12 without leading zeros

            $this->logger->debug('Indexing file', [
                'file_id' => $file->getId(),
                'user_id' => $userId,
                'path' => $path,
                'relative_path' => $relativePath,
                'folder_path' => $folderPath,
                'extension' => $extension,
            ]);

            $fileIndex->setFileId($file->getId());
            $fileIndex->setUserId($userId);
            $fileIndex->setName($file->getName());
            $fileIndex->setPath($relativePath);
            $fileIndex->setFolderPath($folderPath);
            $fileIndex->setFolderPathHash($this->hashFolderPath($folderPath));
            $fileIndex->setExtension($extension);
            $fileIndex->setMtime($mtime);
            $fileIndex->setSize($file->getSize());
            $fileIndex->setYear($year);
            $fileIndex->setMonth($month);
            $fileIndex->setIndexedAt(time());

            if ($existing !== null) {
                $this->fileIndexMapper->update($fileIndex);
            } else {
                $this->fileIndexMapper->insert($fileIndex);
            }
        } catch (\Throwable $e) {
            $this->logger->error('Failed to index file: ' . $e->getMessage(), [
                'file_id' => $file->getId(),
                'user_id' => $userId,
                'exception' => $e,
            ]);
        }
    }

    /**
     * Remove file from index.
     */
    public function removeFile(int $fileId, string $userId): void
    {
        try {
            $this->fileIndexMapper->deleteByFileId($fileId, $userId);
        } catch (\Throwable $e) {
            $this->logger->error('Failed to remove file from index: ' . $e->getMessage(), [
                'file_id' => $fileId,
                'user_id' => $userId,
                'exception' => $e,
            ]);
        }
    }

    /**
     * Reindex all files for a user.
     *
     * Tracks progress in the distributed cache so a parallel GET /api/files/index-status
     * request can show a progress bar while the POST /api/files/index request blocks.
     */
    public function reindexUser(string $userId): void
    {
        try {
            // Clear existing index
            $this->fileIndexMapper->deleteByUser($userId);

            // Get user folder
            $userFolder = $this->rootFolder->getUserFolder($userId);

            $this->logger->debug('Starting full re-index for user', [
                'user_id' => $userId,
                'root_path' => $userFolder->getPath(),
            ]);

            // Pre-scan to count total 3D files for progress bar. Uses the same
            // folder-skipping rules as the actual index pass.
            $total = $this->countSupportedFiles($userFolder);
            $now = time();
            $this->setProgress($userId, [
                'active' => true,
                'total' => $total,
                'processed' => 0,
                'startedAt' => $now,
                'updatedAt' => $now,
            ]);

            // Recursively index all 3D files
            $this->indexFolder($userFolder, $userId);

            // Mark done (keep a non-active snapshot for a minute so UI can read final state)
            $this->setProgress($userId, [
                'active' => false,
                'total' => $total,
                'processed' => $total,
                'startedAt' => $now,
                'updatedAt' => time(),
            ]);
        } catch (\Throwable $e) {
            $this->logger->error('Failed to reindex user files: ' . $e->getMessage(), [
                'user_id' => $userId,
                'exception' => $e,
            ]);
            // Best-effort cleanup so a failed run doesn't leave a "100%" ghost in the cache
            $this->clearProgress($userId);
        }
    }

    /**
     * Count how many supported 3D files live under the folder, honoring the
     * same skip rules (hidden folders, .no3d markers) as indexFolder.
     */
    private function countSupportedFiles(\OCP\Files\Folder $folder): int
    {
        try {
            $folderName = $folder->getName();
            if (str_starts_with($folderName, '.') && $folderName !== '') {
                return 0;
            }
            if ($folder->nodeExists('.no3d')) {
                return 0;
            }

            $count = 0;
            foreach ($folder->getDirectoryListing() as $node) {
                if ($node instanceof File) {
                    $ext = strtolower($node->getExtension());
                    if ($this->modelFileSupport->isSupported($ext)) {
                        $count++;
                    }
                } elseif ($node instanceof \OCP\Files\Folder) {
                    $count += $this->countSupportedFiles($node);
                }
            }

            return $count;
        } catch (\Throwable $e) {
            return 0;
        }
    }

    private function bumpProgress(string $userId): void
    {
        $current = $this->getProgressCache()->get($userId);
        if (!is_array($current)) {
            return;
        }
        $current['processed'] = (int) ($current['processed'] ?? 0) + 1;
        $current['updatedAt'] = time();
        $this->setProgress($userId, $current);
    }

    /**
     * Recursively index files in a folder.
     */
    private function indexFolder(\OCP\Files\Folder $folder, string $userId): void
    {
        try {
            $folderName = $folder->getName();

            // 1. Skip hidden folders (starting with dot), including .3dviewer_temp
            if (str_starts_with($folderName, '.') && $folderName !== '') {
                $this->logger->debug('Skipping hidden folder from index', [
                    'folder' => $folder->getPath(),
                    'user_id' => $userId,
                ]);

                return;
            }

            // 2. Check for .no3d marker file
            if ($folder->nodeExists('.no3d')) {
                $this->logger->debug('Skipping folder with .no3d marker', [
                    'folder' => $folder->getPath(),
                    'user_id' => $userId,
                ]);

                return;
            }

            $children = $folder->getDirectoryListing();

            foreach ($children as $node) {
                if ($node instanceof File) {
                    $ext = strtolower($node->getExtension());
                    if ($this->modelFileSupport->isSupported($ext)) {
                        $this->indexFile($node, $userId);
                        $this->bumpProgress($userId);
                    }
                } elseif ($node instanceof \OCP\Files\Folder) {
                    $this->indexFolder($node, $userId);
                }
            }
        } catch (\Throwable $e) {
            $this->logger->error('Failed to index folder: ' . $e->getMessage(), [
                'folder_path' => $folder->getPath(),
                'user_id' => $userId,
                'exception' => $e,
            ]);
        }
    }

    private function hashFolderPath(string $folderPath): string
    {
        return hash('sha256', $folderPath);
    }
}
