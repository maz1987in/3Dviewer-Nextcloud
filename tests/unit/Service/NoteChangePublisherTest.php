<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Activity\NoteActivityPublisher;
use OCA\ThreeDViewer\Activity\Provider;
use OCA\ThreeDViewer\Db\Note;
use OCA\ThreeDViewer\Notification\NoteNotificationPublisher;
use OCA\ThreeDViewer\Service\NoteActor;
use OCA\ThreeDViewer\Service\NoteChangePublisher;
use OCP\Files\File;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class NoteChangePublisherTest extends TestCase
{
    private NoteActivityPublisher&MockObject $activity;
    private NoteNotificationPublisher&MockObject $notifications;
    private LoggerInterface&MockObject $logger;
    private NoteChangePublisher $publisher;

    protected function setUp(): void
    {
        $this->activity = $this->createMock(NoteActivityPublisher::class);
        $this->notifications = $this->createMock(NoteNotificationPublisher::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->publisher = new NoteChangePublisher($this->activity, $this->notifications, $this->logger);
    }

    private function note(int $id = 31, string $author = 'lina', int $updatedAt = 10_000): Note
    {
        $note = new Note();
        $note->setId($id);
        $note->setFileId(7);
        $note->setAuthorUid($author);
        $note->setUpdatedAt($updatedAt);

        return $note;
    }

    public function testANewNoteIsPublishedToTheStreamAndNotified(): void
    {
        $file = $this->createMock(File::class);
        $note = $this->note();
        $actor = NoteActor::user('lina');
        $this->activity->expects($this->once())->method('publish')->with(Provider::NOTE_ADDED, $file, $actor, 31);
        $this->notifications->expects($this->once())->method('noteAdded')->with($file, $note, $actor);

        $this->publisher->added($file, $note, $actor);
    }

    public function testWithoutAFileThereIsNobodyToTell(): void
    {
        $this->activity->expects($this->never())->method('publish');
        $this->notifications->expects($this->never())->method('noteAdded');

        $this->publisher->added(null, $this->note(), NoteActor::user('lina'));
        $this->publisher->changed(null, $this->note(), NoteActor::user('lina'), 0);
        $this->publisher->deleted(null, 31, NoteActor::user('lina'));
    }

    public function testAChangeByAnotherPersonGoesToTheStreamAndNeverNotifies(): void
    {
        $file = $this->createMock(File::class);
        $this->activity->expects($this->once())->method('publish')->with(Provider::NOTE_CHANGED, $file, $this->anything(), 31);
        $this->notifications->expects($this->never())->method('noteAdded');

        // Last touched an hour ago, by someone else
        $this->publisher->changed($file, $this->note(31, 'lina', 10_000), NoteActor::user('omar'), 10_000 - 3600);
    }

    public function testTheAuthorStillTypingTheTextOfTheirNewNoteDoesNotFloodTheStream(): void
    {
        $this->activity->expects($this->never())->method('publish');

        // Saved a second after the note was last touched, by the note's own author
        $this->publisher->changed($this->createMock(File::class), $this->note(31, 'lina', 10_001), NoteActor::user('lina'), 10_000);
    }

    public function testTheAuthorEditingTheirNoteAgainAfterAWhileIsNews(): void
    {
        $file = $this->createMock(File::class);
        $this->activity->expects($this->once())->method('publish')->with(Provider::NOTE_CHANGED, $file, $this->anything(), 31);

        $this->publisher->changed($file, $this->note(31, 'lina', 10_000 + NoteChangePublisher::QUIET_EDIT_SECONDS + 1), NoteActor::user('lina'), 10_000);
    }

    public function testSomeoneElsesQuickEditOfANoteIsStillNews(): void
    {
        $file = $this->createMock(File::class);
        $this->activity->expects($this->once())->method('publish');

        // Quick, but not by the note's author, so it is not their typing
        $this->publisher->changed($file, $this->note(31, 'lina', 10_001), NoteActor::user('omar'), 10_000);
    }

    public function testADeletionIsPublishedWithoutANoteLinkAndItsNotificationIsDismissed(): void
    {
        $file = $this->createMock(File::class);
        $actor = NoteActor::user('lina');
        $this->activity->expects($this->once())->method('publish')->with(Provider::NOTE_DELETED, $file, $actor, null);
        $this->notifications->expects($this->once())->method('noteDeleted')->with(31);

        $this->publisher->deleted($file, 31, $actor);
    }

    public function testANoteDeletedWhereNoFileIsKnownStillHasItsNotificationDismissed(): void
    {
        $this->notifications->expects($this->once())->method('noteDeleted')->with(31);

        $this->publisher->deleted(null, 31, NoteActor::user('lina'));
    }

    public function testAFailureInTheStreamDoesNotStopTheNotificationOrEscape(): void
    {
        $file = $this->createMock(File::class);
        $this->activity->method('publish')->willThrowException(new \RuntimeException('activity app broken'));
        $this->notifications->expects($this->once())->method('noteAdded');
        $this->logger->expects($this->once())->method('warning');

        $this->publisher->added($file, $this->note(), NoteActor::user('lina'));
    }

    public function testAFailureInNotifyingDoesNotEscapeEither(): void
    {
        $file = $this->createMock(File::class);
        $this->notifications->method('noteAdded')->willThrowException(new \RuntimeException('notifications app broken'));
        $this->activity->expects($this->once())->method('publish');
        $this->logger->expects($this->once())->method('warning');

        $this->publisher->added($file, $this->note(), NoteActor::user('lina'));
    }
}
