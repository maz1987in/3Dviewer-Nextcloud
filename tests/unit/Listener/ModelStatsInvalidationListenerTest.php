<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Listener;

use OCA\ThreeDViewer\Listener\ModelStatsInvalidationListener;
use OCA\ThreeDViewer\Service\ModelStatsService;
use OCP\EventDispatcher\Event;
use OCP\Files\Events\Node\NodeDeletedEvent;
use OCP\Files\Events\Node\NodeWrittenEvent;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\NotFoundException;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * A model's stored statistics go when its content changes or the file is deleted. The
 * listener must never be the reason a write or a delete fails.
 */
class ModelStatsInvalidationListenerTest extends TestCase
{
    private ModelStatsService&MockObject $stats;
    private LoggerInterface&MockObject $logger;
    private ModelStatsInvalidationListener $listener;

    protected function setUp(): void
    {
        $this->stats = $this->createMock(ModelStatsService::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->listener = new ModelStatsInvalidationListener($this->stats, $this->logger);
    }

    public function testWriteDropsTheStatistics(): void
    {
        $this->stats->expects($this->once())->method('delete')->with(42);

        $this->listener->handle(new NodeWrittenEvent($this->file(42)));
    }

    public function testDeleteDropsTheStatistics(): void
    {
        $this->stats->expects($this->once())->method('delete')->with(42);

        $this->listener->handle(new NodeDeletedEvent($this->file(42)));
    }

    public function testFilesThatCanNeverHaveStatisticsAreIgnored(): void
    {
        $this->stats->expects($this->never())->method('delete');

        $this->listener->handle(new NodeWrittenEvent($this->file(42, 'notes.txt')));
        $this->listener->handle(new NodeDeletedEvent($this->file(42, 'notes.txt')));
        $this->listener->handle(new NodeWrittenEvent($this->file(42, 'thumbnail.png')));
    }

    public function testExtensionMatchIgnoresCase(): void
    {
        $this->stats->expects($this->once())->method('delete')->with(42);

        $this->listener->handle(new NodeWrittenEvent($this->file(42, 'Part.STL')));
    }

    public function testFoldersAreIgnored(): void
    {
        $folder = $this->createMock(Folder::class);
        $folder->method('getId')->willReturn(9);
        $this->stats->expects($this->never())->method('delete');

        $this->listener->handle(new NodeWrittenEvent($folder));
        $this->listener->handle(new NodeDeletedEvent($folder));
    }

    public function testNullIdIsIgnored(): void
    {
        $this->stats->expects($this->never())->method('delete');

        $this->listener->handle(new NodeWrittenEvent($this->file(null)));
    }

    public function testOtherEventsAreIgnored(): void
    {
        $this->stats->expects($this->never())->method('delete');

        $this->listener->handle(new Event());
    }

    public function testAFailingDeleteNeverBlocksTheWrite(): void
    {
        $this->stats->method('delete')->willThrowException(new NotFoundException('raced'));
        $this->logger->expects($this->once())->method('warning');

        $this->listener->handle(new NodeWrittenEvent($this->file(42)));
    }

    public function testAFailingDeleteNeverBlocksTheDelete(): void
    {
        $this->stats->method('delete')->willThrowException(new \RuntimeException('disk full'));
        $this->logger->expects($this->once())->method('warning');

        $this->listener->handle(new NodeDeletedEvent($this->file(42)));
    }

    public function testAThrowingGetIdNeverBlocksTheDelete(): void
    {
        // A node already gone from the cache can answer getId() with NotFoundException
        $file = $this->createMock(File::class);
        $file->method('getExtension')->willReturn('stl');
        $file->method('getId')->willThrowException(new NotFoundException('gone'));
        $this->stats->expects($this->never())->method('delete');
        $this->logger->expects($this->once())->method('warning');

        $this->listener->handle(new NodeDeletedEvent($file));
    }

    public function testAThrowingGetExtensionNeverBlocksTheWrite(): void
    {
        $file = $this->createMock(File::class);
        $file->method('getExtension')->willThrowException(new NotFoundException('gone'));
        $this->stats->expects($this->never())->method('delete');
        $this->logger->expects($this->once())->method('warning');

        $this->listener->handle(new NodeWrittenEvent($file));
    }

    private function file(?int $id, string $name = 'part.stl'): File
    {
        $file = $this->createMock(File::class);
        $file->method('getId')->willReturn($id);
        $file->method('getName')->willReturn($name);
        $file->method('getExtension')->willReturn(pathinfo($name, PATHINFO_EXTENSION));

        return $file;
    }
}
