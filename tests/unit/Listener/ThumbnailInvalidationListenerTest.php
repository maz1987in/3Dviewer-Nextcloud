<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Listener;

use OCA\ThreeDViewer\Listener\ThumbnailInvalidationListener;
use OCA\ThreeDViewer\Service\ThumbnailService;
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
 * A file's stored thumbnails go when its content changes or the file is deleted.
 *
 * Nextcloud clears its own preview cache on write; this keeps the app's store consistent
 * with that. The listener must never be the reason a write or a delete fails.
 */
class ThumbnailInvalidationListenerTest extends TestCase
{
    private ThumbnailService&MockObject $thumbnails;
    private LoggerInterface&MockObject $logger;
    private ThumbnailInvalidationListener $listener;

    protected function setUp(): void
    {
        $this->thumbnails = $this->createMock(ThumbnailService::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->listener = new ThumbnailInvalidationListener($this->thumbnails, $this->logger);
    }

    public function testWriteDeletesAllVersions(): void
    {
        $this->thumbnails->expects($this->once())->method('deleteAll')->with(42);

        $this->listener->handle(new NodeWrittenEvent($this->file(42)));
    }

    public function testDeleteDeletesAllVersions(): void
    {
        $this->thumbnails->expects($this->once())->method('deleteAll')->with(42);

        $this->listener->handle(new NodeDeletedEvent($this->file(42)));
    }

    public function testFoldersAreIgnored(): void
    {
        $folder = $this->createMock(Folder::class);
        $folder->method('getId')->willReturn(9);
        $this->thumbnails->expects($this->never())->method('deleteAll');

        $this->listener->handle(new NodeWrittenEvent($folder));
        $this->listener->handle(new NodeDeletedEvent($folder));
    }

    public function testNullIdIsIgnored(): void
    {
        $this->thumbnails->expects($this->never())->method('deleteAll');

        $this->listener->handle(new NodeWrittenEvent($this->file(null)));
    }

    public function testOtherEventsAreIgnored(): void
    {
        $this->thumbnails->expects($this->never())->method('deleteAll');

        $this->listener->handle(new Event());
    }

    public function testAFailingDeleteNeverBlocksTheWrite(): void
    {
        $this->thumbnails->method('deleteAll')->willThrowException(new NotFoundException('raced'));
        $this->logger->expects($this->once())->method('warning');

        $this->listener->handle(new NodeWrittenEvent($this->file(42)));
    }

    public function testAFailingDeleteNeverBlocksTheDelete(): void
    {
        $this->thumbnails->method('deleteAll')->willThrowException(new \RuntimeException('disk full'));
        $this->logger->expects($this->once())->method('warning');

        $this->listener->handle(new NodeDeletedEvent($this->file(42)));
    }

    private function file(?int $id): File
    {
        $file = $this->createMock(File::class);
        $file->method('getId')->willReturn($id);

        return $file;
    }
}
