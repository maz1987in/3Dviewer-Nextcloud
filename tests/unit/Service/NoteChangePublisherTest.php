<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Activity\NoteActivityPublisher;
use OCA\ThreeDViewer\Activity\Provider;
use OCA\ThreeDViewer\Db\Note;
use OCA\ThreeDViewer\Db\NoteReply;
use OCA\ThreeDViewer\Notification\NoteNotificationPublisher;
use OCA\ThreeDViewer\Service\NoteActor;
use OCA\ThreeDViewer\Service\NoteChangePublisher;
use OCA\ThreeDViewer\Service\NoteMentions;
use OCP\Files\File;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class NoteChangePublisherTest extends TestCase
{
    private NoteActivityPublisher&MockObject $activity;
    private NoteNotificationPublisher&MockObject $notifications;
    private NoteMentions&MockObject $mentions;
    private LoggerInterface&MockObject $logger;
    private NoteChangePublisher $publisher;

    protected function setUp(): void
    {
        $this->activity = $this->createMock(NoteActivityPublisher::class);
        $this->notifications = $this->createMock(NoteNotificationPublisher::class);
        $this->mentions = $this->createMock(NoteMentions::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->publisher = new NoteChangePublisher($this->activity, $this->notifications, $this->mentions, $this->logger);
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
        $this->notifications->expects($this->once())->method('noteAdded')->with($file, $note, $actor, []);
        $this->notifications->expects($this->never())->method('mentioned');

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

    /** The text a mention test gives a note: only its mentions matter, the mock answers by text. */
    private function textNote(string $text, int $id = 31, string $author = 'lina'): Note
    {
        $note = $this->note($id, $author);
        $note->setPayload(json_encode(['space' => 'model', 'point' => ['x' => 0, 'y' => 0, 'z' => 0], 'text' => $text], JSON_THROW_ON_ERROR));

        return $note;
    }

    /** @param array<string, list<string>> $byText what the mentions service finds in each text */
    private function mentionsIn(array $byText): void
    {
        $this->mentions->method('uids')->willReturnCallback(fn (string $text, bool $settled) => $byText[$text] ?? []);
    }

    public function testANewNoteThatMentionsSomeoneNotifiesThemAndNotWithTheRegularNotification(): void
    {
        $file = $this->createMock(File::class);
        $note = $this->textNote('Look @sara');
        $actor = NoteActor::user('lina');
        $this->mentionsIn(['Look @sara' => ['sara']]);
        $this->activity->expects($this->once())->method('publish')->with(Provider::NOTE_ADDED, $file, $actor, 31);
        // The mention wins: the regular notification is told to leave sara out
        $this->notifications->expects($this->once())->method('noteAdded')->with($file, $note, $actor, ['sara']);
        $this->notifications->expects($this->once())->method('mentioned')->with($file, $note, $actor, ['sara']);

        $this->publisher->added($file, $note, $actor);
    }

    public function testANoteIsReadForMentionsOnlyOnceTheyAreSettled(): void
    {
        $this->mentions->expects($this->once())->method('uids')->with('Look @sa', true)->willReturn([]);

        $this->publisher->added($this->createMock(File::class), $this->textNote('Look @sa'), NoteActor::user('lina'));
    }

    public function testAnEditNotifiesOnlyThosePeopleItAddsEvenWhenItIsTheAuthorsQuickTyping(): void
    {
        $file = $this->createMock(File::class);
        $note = $this->textNote('Look @sara and @omar', 31, 'lina');
        $note->setUpdatedAt(10_001);
        $this->mentionsIn(['Look @sara and @omar' => ['sara', 'omar'], 'Look @sara and ' => ['sara']]);
        $this->notifications->expects($this->once())->method('mentioned')->with($file, $note, $this->anything(), ['omar']);
        // Quick typing by the author: not news for the stream, but the new mention still is
        $this->activity->expects($this->never())->method('publish');

        $this->publisher->changed($file, $note, NoteActor::user('lina'), 10_000, 'Look @sara and ');
    }

    public function testAnEditThatAddsNoOneNotifiesNoOne(): void
    {
        $note = $this->textNote('Look @sara closely');
        $this->mentionsIn(['Look @sara closely' => ['sara'], 'Look @sara' => ['sara']]);
        $this->notifications->expects($this->never())->method('mentioned');

        $this->publisher->changed($this->createMock(File::class), $note, NoteActor::user('omar'), 0, 'Look @sara');
    }

    public function testResolvingAndReopeningGoToTheStreamAndNeverNotify(): void
    {
        $file = $this->createMock(File::class);
        $actor = NoteActor::user('omar');
        $note = $this->note();
        $note->setState(Note::STATE_RESOLVED);
        $reopened = $this->note();
        $this->activity->expects($this->exactly(2))->method('publish')->willReturnCallback(
            function (string $subject, File $f, NoteActor $a, ?int $noteId) use ($file, $actor): void {
                $this->assertSame($file, $f);
                $this->assertSame($actor, $a);
                $this->assertSame(31, $noteId);
                $this->assertContains($subject, [Provider::NOTE_RESOLVED, Provider::NOTE_REOPENED]);
            },
        );
        $this->notifications->expects($this->never())->method('noteAdded');
        $this->notifications->expects($this->never())->method('mentioned');

        $this->publisher->stateChanged($file, $note, $actor);
        $this->publisher->stateChanged($file, $reopened, $actor);
    }

    public function testAReplyGoesToTheStreamAndNotifiesThoseItMentions(): void
    {
        $file = $this->createMock(File::class);
        $actor = NoteActor::user('omar');
        $note = $this->note();
        $reply = new NoteReply();
        $reply->setText('Fixed, @lina');
        $this->mentionsIn(['Fixed, @lina' => ['lina']]);
        $this->activity->expects($this->once())->method('publish')->with(Provider::NOTE_REPLIED, $file, $actor, 31);
        $this->notifications->expects($this->once())->method('mentioned')->with($file, $note, $actor, ['lina']);
        $this->notifications->expects($this->never())->method('noteAdded');

        $this->publisher->replied($file, $note, $reply, $actor);
    }

    public function testAReplyThatMentionsNoOneNotifiesNoOne(): void
    {
        $reply = new NoteReply();
        $reply->setText('Fixed');
        $this->activity->expects($this->once())->method('publish');
        $this->notifications->expects($this->never())->method('mentioned');

        $this->publisher->replied($this->createMock(File::class), $this->note(), $reply, NoteActor::user('omar'));
    }

    public function testARepliesLastWordIsFinalSoItCountsAtOnce(): void
    {
        $reply = new NoteReply();
        $reply->setText('Thanks @lina');
        $this->mentions->expects($this->once())->method('uids')->with('Thanks @lina', false)->willReturn(['lina']);

        $this->publisher->replied($this->createMock(File::class), $this->note(), $reply, NoteActor::user('omar'));
    }

    public function testEditingAReplyNotifiesOnlyThoseItAdds(): void
    {
        $file = $this->createMock(File::class);
        $note = $this->note();
        $reply = new NoteReply();
        $reply->setText('Fixed, @lina and @sara');
        $this->mentionsIn(['Fixed, @lina and @sara' => ['lina', 'sara'], 'Fixed, @lina' => ['lina']]);
        $this->notifications->expects($this->once())->method('mentioned')->with($file, $note, $this->anything(), ['sara']);
        $this->activity->expects($this->never())->method('publish');

        $this->publisher->replyChanged($file, $note, $reply, NoteActor::user('omar'), 'Fixed, @lina');
    }

    public function testNothingIsToldWithoutAFileForStateRepliesAndEdits(): void
    {
        $this->activity->expects($this->never())->method('publish');
        $this->notifications->expects($this->never())->method('mentioned');
        $reply = new NoteReply();
        $actor = NoteActor::user('omar');

        $this->publisher->stateChanged(null, $this->note(), $actor);
        $this->publisher->replied(null, $this->note(), $reply, $actor);
        $this->publisher->replyChanged(null, $this->note(), $reply, $actor, '');
    }

    public function testAFailureReadingMentionsCostsTheMentionAndNotTheNote(): void
    {
        $this->mentions->method('uids')->willThrowException(new \RuntimeException('user backend down'));
        $this->activity->expects($this->once())->method('publish');
        $this->notifications->expects($this->once())->method('noteAdded')->with($this->anything(), $this->anything(), $this->anything(), []);
        $this->logger->expects($this->atLeastOnce())->method('warning');

        $this->publisher->added($this->createMock(File::class), $this->textNote('Look @sara'), NoteActor::user('lina'));
    }

    public function testAFailureInTheMentionNotificationDoesNotEscape(): void
    {
        $this->mentionsIn(['Look @sara' => ['sara']]);
        $this->notifications->method('mentioned')->willThrowException(new \RuntimeException('notifications app broken'));
        $this->activity->expects($this->once())->method('publish');
        $this->logger->expects($this->once())->method('warning');

        $this->publisher->added($this->createMock(File::class), $this->textNote('Look @sara'), NoteActor::user('lina'));
    }
}
