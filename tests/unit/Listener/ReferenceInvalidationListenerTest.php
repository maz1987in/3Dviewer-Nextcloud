<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Listener;

use OCA\ThreeDViewer\Listener\ReferenceInvalidationListener;
use OCP\Collaboration\Reference\IReferenceManager;
use OCP\EventDispatcher\Event;
use OCP\Files\Events\Node\NodeWrittenEvent;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\NotFoundException;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * A model's cached link previews go when its content changes, so a card never keeps the
 * old size or the old thumbnail for the hour Nextcloud caches it. Core handles delete,
 * rename and share; a write is the case it leaves.
 */
class ReferenceInvalidationListenerTest extends TestCase
{
    private IReferenceManager&MockObject $references;
    private LoggerInterface&MockObject $logger;
    private ReferenceInvalidationListener $listener;

    protected function setUp(): void
    {
        $this->references = $this->createMock(IReferenceManager::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->listener = new ReferenceInvalidationListener($this->references, $this->logger);
    }

    private function file(int $id, string $name = 'part.glb'): File
    {
        $file = $this->createMock(File::class);
        $file->method('getId')->willReturn($id);
        $file->method('getExtension')->willReturn(pathinfo($name, PATHINFO_EXTENSION));

        return $file;
    }

    public function testAWrittenModelDropsItsCardsUnderTheFileId(): void
    {
        $this->references->expects($this->once())->method('invalidateCache')->with('42');

        $this->listener->handle(new NodeWrittenEvent($this->file(42, 'Part.STL')));
    }

    public function testEverythingThatIsNotAModelIsLeftAtOnce(): void
    {
        $this->references->expects($this->never())->method('invalidateCache');

        $this->listener->handle(new NodeWrittenEvent($this->file(42, 'notes.txt')));
        $this->listener->handle(new NodeWrittenEvent($this->file(42, 'part.mtl')));
        $this->listener->handle(new NodeWrittenEvent($this->createMock(Folder::class)));
        $this->listener->handle(new Event());
    }

    public function testAFailureNeverBlocksTheWrite(): void
    {
        $this->references->method('invalidateCache')->willThrowException(new \RuntimeException('cache down'));
        $this->logger->expects($this->once())->method('warning');

        $this->listener->handle(new NodeWrittenEvent($this->file(42)));
    }

    public function testANodeThatCannotBeReadNeverBlocksTheWrite(): void
    {
        $file = $this->createMock(File::class);
        $file->method('getExtension')->willThrowException(new NotFoundException('gone'));
        $this->references->expects($this->never())->method('invalidateCache');
        $this->logger->expects($this->once())->method('warning');

        $this->listener->handle(new NodeWrittenEvent($file));
    }
}
