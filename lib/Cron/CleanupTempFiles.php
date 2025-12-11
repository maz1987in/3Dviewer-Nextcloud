<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Cron;

use OCP\AppFramework\Utility\ITimeFactory;
use OCP\BackgroundJob\TimedJob;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\IUserManager;
use OCP\Share\IManager as ShareManager;
use OCP\Share\IShare;
use Psr\Log\LoggerInterface;

class CleanupTempFiles extends TimedJob
{
    private const TEMP_FOLDER = '.3dviewer_temp';
    private const MAX_TEMP_FILE_AGE = 86400; // 24 hours

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

        // Iterate over all users
        // note: searching all users might be slow on large instances, 
        // but it's the only way to access user-specific folders
        foreach ($this->userManager->callForAllUsers(function ($user) {
            $userId = $user->getUID();
            $this->cleanupUserTempFiles($userId);
        }) as $result) {
            // empty loop to consume the generator
        }

        $this->logger->info('Finished 3D Viewer temp file cleanup job');
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

            foreach ($files as $file) {
                $age = $now - $file->getMTime();
                if ($age > self::MAX_TEMP_FILE_AGE) {
                    // Delete shares first
                    $shares = $this->shareManager->getSharesBy($userId, IShare::TYPE_LINK, $file, false, -1, 0);
                    foreach ($shares as $share) {
                        $this->shareManager->deleteShare($share);
                    }

                    // Delete the file
                    $file->delete();
                    $this->logger->debug('Cleaned up old temp file via cron', [
                        'user' => $userId,
                        'filename' => $file->getName(),
                        'age' => $age,
                    ]);
                }
            }
        } catch (NotFoundException $e) {
            // User folder might not exist or other issues
        } catch (\Throwable $e) {
            $this->logger->error('Error cleaning up temp files for user ' . $userId, [
                'error' => $e->getMessage(),
            ]);
        }
    }
}

