<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Cron;

use OCP\AppFramework\Utility\ITimeFactory;
use OCP\BackgroundJob\TimedJob;
use OCP\Files\IRootFolder;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use OCP\IUserManager;
use OCP\Share\IManager as ShareManager;
use OCP\Share\IShare;
use Psr\Log\LoggerInterface;

class CleanupTempFiles extends TimedJob
{
    private const TEMP_FOLDER = '.3dviewer_temp';
    private const MAX_TEMP_FILE_AGE = 86400; // 24 hours
    private const PROGRESS_LOG_INTERVAL = 100; // Log progress every N users

    private int $totalFilesDeleted = 0;
    private int $totalSharesDeleted = 0;
    private int $totalUsersProcessed = 0;
    private int $totalErrors = 0;

    public function __construct(
        ITimeFactory $time,
        private IRootFolder $rootFolder,
        private IUserManager $userManager,
        private ShareManager $shareManager,
        private LoggerInterface $logger
    ) {
        parent::__construct($time);
        // Run roughly every 6 hours for tighter expiry enforcement
        $this->setInterval(21600);
    }

    protected function run($argument): void
    {
        $this->logger->info('Starting 3D Viewer temp file cleanup job');

        // Reset statistics
        $this->totalFilesDeleted = 0;
        $this->totalSharesDeleted = 0;
        $this->totalUsersProcessed = 0;
        $this->totalErrors = 0;

        // Iterate over all users
        // note: searching all users might be slow on large instances,
        // but it's the only way to access user-specific folders
        $this->userManager->callForAllUsers(function ($user) {
            $userId = $user->getUID();
            $this->cleanupUserTempFiles($userId);
            $this->totalUsersProcessed++;

            // Log progress periodically for large instances
            if ($this->totalUsersProcessed % self::PROGRESS_LOG_INTERVAL === 0) {
                $this->logger->info('3D Viewer cleanup progress', [
                    'users_processed' => $this->totalUsersProcessed,
                    'files_deleted' => $this->totalFilesDeleted,
                    'shares_deleted' => $this->totalSharesDeleted,
                    'errors' => $this->totalErrors,
                ]);
            }
        });

        $this->logger->info('Finished 3D Viewer temp file cleanup job', [
            'users_processed' => $this->totalUsersProcessed,
            'files_deleted' => $this->totalFilesDeleted,
            'shares_deleted' => $this->totalSharesDeleted,
            'errors' => $this->totalErrors,
        ]);
    }

    private function cleanupUserTempFiles(string $userId): void
    {
        try {
            $userFolder = $this->rootFolder->getUserFolder($userId);

            if (!$userFolder->nodeExists(self::TEMP_FOLDER)) {
                return;
            }

            $tempFolder = $userFolder->get(self::TEMP_FOLDER);
            $files = $tempFolder->getDirectoryListing();
            $now = time();

            foreach ($files as $node) {
                // Only process actual files, skip directories
                if ($node->getType() !== Node::TYPE_FILE) {
                    continue;
                }

                $age = $now - $node->getMTime();
                if ($age > self::MAX_TEMP_FILE_AGE) {
                    $sharesDeleted = $this->deleteFileShares($userId, $node);
                    $this->totalSharesDeleted += $sharesDeleted;

                    // Delete the file
                    $node->delete();
                    $this->totalFilesDeleted++;

                    $this->logger->debug('Cleaned up old temp file via cron', [
                        'user' => $userId,
                        'filename' => $node->getName(),
                        'age' => $age,
                        'shares_deleted' => $sharesDeleted,
                    ]);
                }
            }
        } catch (NotFoundException $e) {
            // User folder might not exist or temp folder was deleted during processing
            $this->logger->debug('User folder or temp folder not found during cleanup', [
                'user' => $userId,
                'reason' => $e->getMessage(),
            ]);
        } catch (\Throwable $e) {
            $this->totalErrors++;
            $this->logger->error('Error cleaning up temp files for user ' . $userId, [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
        }
    }

    private function deleteFileShares(string $userId, Node $file): int
    {
        $deletedCount = 0;

        try {
            $shares = $this->shareManager->getSharesBy($userId, IShare::TYPE_LINK, $file, false, -1, 0);
            foreach ($shares as $share) {
                try {
                    $this->shareManager->deleteShare($share);
                    $deletedCount++;
                } catch (\Throwable $e) {
                    $this->logger->warning('Failed to delete share for temp file', [
                        'user' => $userId,
                        'filename' => $file->getName(),
                        'share_id' => $share->getId(),
                        'error' => $e->getMessage(),
                    ]);
                }
            }
        } catch (\Throwable $e) {
            $this->logger->warning('Failed to retrieve shares for temp file', [
                'user' => $userId,
                'filename' => $file->getName(),
                'error' => $e->getMessage(),
            ]);
        }

        return $deletedCount;
    }
}
