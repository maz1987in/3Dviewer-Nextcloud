<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Cron;

use OCA\ThreeDViewer\Db\ModelStatMapper;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\BackgroundJob\TimedJob;
use Psr\Log\LoggerInterface;

/**
 * Removes the statistics of models that have been permanently deleted. The listener that
 * drops them as a file goes (ModelStatsInvalidationListener) can miss one: a delete that
 * did not run through the file system hooks, or a row left by a failed cleanup.
 *
 * @psalm-suppress UnusedClass Registered via info.xml background-jobs at runtime.
 */
class CleanupOrphanModelStats extends TimedJob
{
    /** @psalm-suppress PossiblyUnusedMethod Constructed by the DI container */
    public function __construct(
        ITimeFactory $time,
        private readonly ModelStatMapper $mapper,
        private readonly LoggerInterface $logger,
    ) {
        parent::__construct($time);
        $this->setInterval(86400);
        $this->setTimeSensitivity(self::TIME_INSENSITIVE);
    }

    protected function run(mixed $argument): void
    {
        $deleted = $this->mapper->deleteOrphans();
        if ($deleted > 0) {
            $this->logger->info('3D Viewer removed statistics of deleted models', ['statistics' => $deleted]);
        }
    }
}
