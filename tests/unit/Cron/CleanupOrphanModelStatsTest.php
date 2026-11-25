<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Cron;

use OCA\ThreeDViewer\Cron\CleanupOrphanModelStats;
use OCA\ThreeDViewer\Db\ModelStatMapper;
use OCP\AppFramework\Utility\ITimeFactory;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class CleanupOrphanModelStatsTest extends TestCase
{
    public function testRemovesTheStatisticsOfDeletedModels(): void
    {
        $mapper = $this->createMock(ModelStatMapper::class);
        $mapper->expects($this->once())->method('deleteOrphans')->willReturn(2);
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects($this->once())->method('info')
            ->with('3D Viewer removed statistics of deleted models', ['statistics' => 2]);

        $job = new CleanupOrphanModelStats($this->createMock(ITimeFactory::class), $mapper, $logger);
        $run = new \ReflectionMethod($job, 'run');
        $run->invoke($job, null);
    }

    public function testRunsDaily(): void
    {
        $job = new CleanupOrphanModelStats(
            $this->createMock(ITimeFactory::class),
            $this->createMock(ModelStatMapper::class),
            $this->createMock(LoggerInterface::class),
        );

        $this->assertSame(86400, $job->getInterval());
    }
}
