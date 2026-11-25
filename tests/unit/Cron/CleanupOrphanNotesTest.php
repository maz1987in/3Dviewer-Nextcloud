<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Cron;

use OCA\ThreeDViewer\Cron\CleanupOrphanNotes;
use OCA\ThreeDViewer\Db\NoteMapper;
use OCA\ThreeDViewer\Db\NoteReplyMapper;
use OCA\ThreeDViewer\Notification\NoteNotificationPublisher;
use OCP\AppFramework\Utility\ITimeFactory;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class CleanupOrphanNotesTest extends TestCase
{
    private NoteMapper&MockObject $notes;
    private NoteReplyMapper&MockObject $replies;
    private NoteNotificationPublisher&MockObject $notifications;
    private LoggerInterface&MockObject $logger;
    private CleanupOrphanNotes $job;

    /** @var list<string> what happened, in order */
    private array $calls = [];

    protected function setUp(): void
    {
        $this->notes = $this->createMock(NoteMapper::class);
        $this->replies = $this->createMock(NoteReplyMapper::class);
        $this->notifications = $this->createMock(NoteNotificationPublisher::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->job = new CleanupOrphanNotes($this->createMock(ITimeFactory::class), $this->notes, $this->replies, $this->notifications, $this->logger);
    }

    private function runJob(): void
    {
        (new \ReflectionMethod($this->job, 'run'))->invoke($this->job, null);
    }

    public function testRemovesTheNotesOfDeletedModelsThenTheRepliesLeftWithoutANote(): void
    {
        $this->notes->method('findOrphanNoteIds')->willReturnCallback(function () {
            $this->calls[] = 'find';

            return [4, 5];
        });
        $this->notes->method('deleteOrphans')->willReturnCallback(function () {
            $this->calls[] = 'notes';

            return 2;
        });
        $this->replies->method('deleteDangling')->willReturnCallback(function () {
            $this->calls[] = 'replies';

            return 3;
        });
        $this->notifications->expects($this->once())->method('notesDeleted')->with([4, 5]);
        $this->logger->expects($this->once())->method('info')
            ->with('3D Viewer removed notes of deleted models', ['notes' => 2, 'replies' => 3]);

        $this->runJob();

        // Replies go after their notes: it is the missing note that makes a reply dangling
        $this->assertSame(['find', 'notes', 'replies'], $this->calls);
    }

    public function testSaysNothingWhenThereWasNothingToRemove(): void
    {
        $this->notes->method('findOrphanNoteIds')->willReturn([]);
        $this->notes->method('deleteOrphans')->willReturn(0);
        $this->replies->method('deleteDangling')->willReturn(0);
        $this->logger->expects($this->never())->method('info');

        $this->runJob();
    }

    public function testRepliesLeftBehindByAnInterruptedDeleteAreStillRemoved(): void
    {
        $this->notes->method('findOrphanNoteIds')->willReturn([]);
        $this->notes->method('deleteOrphans')->willReturn(0);
        $this->replies->expects($this->once())->method('deleteDangling')->willReturn(1);
        $this->logger->expects($this->once())->method('info')->with($this->anything(), ['notes' => 0, 'replies' => 1]);

        $this->runJob();
    }

    public function testRunsDaily(): void
    {
        $this->assertSame(86400, $this->job->getInterval());
    }
}
