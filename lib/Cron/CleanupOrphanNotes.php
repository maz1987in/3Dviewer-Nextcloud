<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Cron;

use OCA\ThreeDViewer\Db\NoteMapper;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\BackgroundJob\TimedJob;
use Psr\Log\LoggerInterface;

/**
 * Removes notes whose model has been permanently deleted.
 */
class CleanupOrphanNotes extends TimedJob
{
    public function __construct(
        ITimeFactory $time,
        private readonly NoteMapper $mapper,
        private readonly LoggerInterface $logger,
    ) {
        parent::__construct($time);
        $this->setInterval(86400);
        $this->setTimeSensitivity(self::TIME_INSENSITIVE);
    }

    protected function run($argument): void
    {
        $deleted = $this->mapper->deleteOrphans();
        if ($deleted > 0) {
            $this->logger->info('3D Viewer removed notes of deleted models', ['notes' => $deleted]);
        }
    }
}
