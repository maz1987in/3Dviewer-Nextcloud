<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Cron;

use OCA\ThreeDViewer\Cron\CleanupOrphanFileSettings;
use OCA\ThreeDViewer\Db\FileSettingMapper;
use OCP\AppFramework\Utility\ITimeFactory;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class CleanupOrphanFileSettingsTest extends TestCase
{
    public function testRemovesTheSettingsOfDeletedModels(): void
    {
        $mapper = $this->createMock(FileSettingMapper::class);
        $mapper->expects($this->once())->method('deleteOrphans')->willReturn(2);
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects($this->once())->method('info')
            ->with('3D Viewer removed unit settings of deleted models', ['settings' => 2]);

        $job = new CleanupOrphanFileSettings($this->createMock(ITimeFactory::class), $mapper, $logger);
        $run = new \ReflectionMethod($job, 'run');
        $run->invoke($job, null);
    }

    public function testRunsDaily(): void
    {
        $job = new CleanupOrphanFileSettings(
            $this->createMock(ITimeFactory::class),
            $this->createMock(FileSettingMapper::class),
            $this->createMock(LoggerInterface::class),
        );

        $this->assertSame(86400, $job->getInterval());
    }
}
