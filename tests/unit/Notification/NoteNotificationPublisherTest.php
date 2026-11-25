<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Notification;

use OCA\ThreeDViewer\Db\Note;
use OCA\ThreeDViewer\Db\NoteMapper;
use OCA\ThreeDViewer\Notification\NoteNotificationPublisher;
use OCA\ThreeDViewer\Service\NoteActor;
use OCA\ThreeDViewer\Service\NoteMentions;
use OCA\ThreeDViewer\Service\NoteRecipients;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\Files\File;
use OCP\Notification\IManager;
use OCP\Notification\INotification;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class NoteNotificationPublisherTest extends TestCase
{
    private const WINDOW = NoteNotificationPublisher::COLLAPSE_SECONDS;

    private IManager&MockObject $manager;
    private NoteRecipients&MockObject $recipients;
    private NoteMapper&MockObject $mapper;
    private LoggerInterface&MockObject $logger;
    private NoteNotificationPublisher $publisher;

    /** @var list<\stdClass> every notification the manager handed out, with what was set on it */
    private array $created = [];

    /** @var list<\stdClass> the ones passed to notify() */
    private array $sent = [];

    /** @var list<\stdClass> the ones passed to markProcessed() */
    private array $dismissed = [];

    protected function setUp(): void
    {
        $this->manager = $this->createMock(IManager::class);
        $this->manager->method('createNotification')->willReturnCallback(fn () => $this->newNotification());
        $this->manager->method('notify')->willReturnCallback(function (INotification $n): void {
            $this->sent[] = $this->record($n);
        });
        $this->manager->method('markProcessed')->willReturnCallback(function (INotification $n): void {
            $this->dismissed[] = $this->record($n);
        });

        $this->recipients = $this->createMock(NoteRecipients::class);
        $this->mapper = $this->createMock(NoteMapper::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $time = $this->createMock(ITimeFactory::class);
        $time->method('getDateTime')->willReturn(new \DateTime('@1800000000'));

        $this->publisher = new NoteNotificationPublisher($this->manager, $this->recipients, $this->mapper, $time, $this->logger);
    }

    /** A notification that remembers what was set on it, and chains like the real one. */
    private function newNotification(): INotification
    {
        $notification = $this->createMock(INotification::class);
        $record = new \stdClass();
        $record->notification = $notification;
        $record->user = '';
        $record->subject = '';
        $record->parameters = [];
        $record->objectType = '';
        $record->objectId = '';
        $this->created[] = $record;

        $notification->method('setApp')->willReturnCallback(function (string $app) use ($notification, $record) {
            $record->app = $app;

            return $notification;
        });
        $notification->method('setUser')->willReturnCallback(function (string $user) use ($notification, $record) {
            $record->user = $user;

            return $notification;
        });
        $notification->method('setDateTime')->willReturnCallback(function (\DateTime $at) use ($notification, $record) {
            $record->at = $at;

            return $notification;
        });
        $notification->method('setObject')->willReturnCallback(function (string $type, string $id) use ($notification, $record) {
            $record->objectType = $type;
            $record->objectId = $id;

            return $notification;
        });
        $notification->method('setSubject')->willReturnCallback(function (string $subject, array $parameters = []) use ($notification, $record) {
            $record->subject = $subject;
            $record->parameters = $parameters;

            return $notification;
        });

        return $notification;
    }

    private function record(INotification $notification): \stdClass
    {
        foreach ($this->created as $record) {
            if ($record->notification === $notification) {
                return $record;
            }
        }
        self::fail('A notification the manager did not create');
    }

    private function note(int $id, int $createdAt, string $author = 'lina', int $fileId = 7): Note
    {
        $note = new Note();
        $note->setId($id);
        $note->setFileId($fileId);
        $note->setAuthorUid($author);
        $note->setCreatedAt($createdAt);

        return $note;
    }

    private function file(): File
    {
        $file = $this->createMock(File::class);
        $file->method('getId')->willReturn(7);

        return $file;
    }

    /**
     * @param list<Note> $history the author's notes on the file, newest first, as the mapper returns them
     * @param list<string> $recipients
     */
    private function given(array $history, array $recipients = ['owner']): void
    {
        $this->mapper->method('findRecentByAuthor')->willReturn($history);
        $this->recipients->method('forNotification')->willReturn($recipients);
    }

    public function testTheFirstNoteOfSomeoneGivesOneNotificationToEachRecipient(): void
    {
        $note = $this->note(30, 1_000);
        $this->given([$note], ['owner', 'sara']);

        $this->publisher->noteAdded($this->file(), $note, NoteActor::user('lina'));

        $this->assertSame(['owner', 'sara'], array_column(array_map(fn ($r) => (array) $r, $this->sent), 'user'));
        $first = $this->sent[0];
        $this->assertSame('threedviewer', $first->app);
        $this->assertSame('note_added', $first->subject);
        $this->assertSame(NoteNotificationPublisher::OBJECT_TYPE, $first->objectType);
        $this->assertSame('30', $first->objectId);
        $this->assertSame(
            ['actorKind' => 'user', 'actor' => 'lina', 'fileId' => 7, 'noteId' => 30, 'count' => 1],
            $first->parameters,
        );
        $this->assertSame(1800000000, $first->at->getTimestamp());
    }

    public function testNoteTextIsNeverPartOfWhatIsSent(): void
    {
        $note = $this->note(30, 1_000);
        $note->setPayload('{"space":"model","point":{"x":1,"y":2,"z":3},"text":"the secret"}');
        $this->given([$note]);

        $this->publisher->noteAdded($this->file(), $note, NoteActor::user('lina'));

        $this->assertStringNotContainsString('secret', json_encode($this->sent[0]->parameters));
    }

    public function testMoreNotesByTheSamePersonInAFewMinutesReplaceThePreviousNotificationWithACount(): void
    {
        $first = $this->note(30, 1_000);
        $second = $this->note(31, 1_000 + 120);
        $third = $this->note(32, 1_000 + 240);
        $this->given([$third, $second, $first]);

        $this->publisher->noteAdded($this->file(), $third, NoteActor::user('lina'));

        // The notification is keyed by the burst's first note, which is what lets it replace the earlier ones
        $this->assertSame('30', $this->sent[0]->objectId);
        $this->assertSame(3, $this->sent[0]->parameters['count']);
        // The link is to the newest note
        $this->assertSame(32, $this->sent[0]->parameters['noteId']);
        // The previous notification of the burst is dismissed first, for this recipient only
        $this->assertSame(['owner'], array_column(array_map(fn ($r) => (array) $r, $this->dismissed), 'user'));
        $this->assertSame('30', $this->dismissed[0]->objectId);
        $this->assertSame(NoteNotificationPublisher::OBJECT_TYPE, $this->dismissed[0]->objectType);
    }

    public function testAGapLongerThanTheWindowStartsANewBurst(): void
    {
        $old = $this->note(30, 1_000);
        $new = $this->note(31, 1_000 + self::WINDOW + 1);
        $this->given([$new, $old]);

        $this->publisher->noteAdded($this->file(), $new, NoteActor::user('lina'));

        $this->assertSame('31', $this->sent[0]->objectId);
        $this->assertSame(1, $this->sent[0]->parameters['count']);
    }

    public function testAGapExactlyTheWindowStillBelongsToTheBurst(): void
    {
        $old = $this->note(30, 1_000);
        $new = $this->note(31, 1_000 + self::WINDOW);
        $this->given([$new, $old]);

        $this->publisher->noteAdded($this->file(), $new, NoteActor::user('lina'));

        $this->assertSame('30', $this->sent[0]->objectId);
        $this->assertSame(2, $this->sent[0]->parameters['count']);
    }

    public function testABurstIsChainedFromNoteToNoteNotMeasuredFromItsStart(): void
    {
        // Three notes, each 8 minutes after the one before: 16 minutes end to end, but never a long pause
        $a = $this->note(30, 1_000);
        $b = $this->note(31, 1_000 + 480);
        $c = $this->note(32, 1_000 + 960);
        $this->given([$c, $b, $a]);

        $this->publisher->noteAdded($this->file(), $c, NoteActor::user('lina'));

        $this->assertSame(3, $this->sent[0]->parameters['count']);
    }

    public function testANoteAfterAPauseDoesNotPullInTheBurstBeforeIt(): void
    {
        $a = $this->note(30, 1_000);
        $b = $this->note(31, 1_000 + 60);
        $pause = $this->note(32, 1_000 + 60 + self::WINDOW + 5);
        $c = $this->note(33, 1_000 + 60 + self::WINDOW + 65);
        $this->given([$c, $pause, $b, $a]);

        $this->publisher->noteAdded($this->file(), $c, NoteActor::user('lina'));

        $this->assertSame('32', $this->sent[0]->objectId);
        $this->assertSame(2, $this->sent[0]->parameters['count']);
    }

    public function testANoteAddedLaterThanTheOneBeingAnnouncedIsNotCounted(): void
    {
        // A second request saved a newer note before this one was announced
        $mine = $this->note(30, 1_000);
        $newer = $this->note(31, 1_010);
        $this->given([$newer, $mine]);

        $this->publisher->noteAdded($this->file(), $mine, NoteActor::user('lina'));

        $this->assertSame('30', $this->sent[0]->objectId);
        $this->assertSame(1, $this->sent[0]->parameters['count']);
    }

    public function testALongBurstIsCountedAsFarBackAsTheLookbackGoes(): void
    {
        $history = [];
        for ($id = 200; $id > 200 - NoteNotificationPublisher::BURST_LOOKBACK; $id--) {
            $history[] = $this->note($id, 1_000 + $id);
        }
        $this->given($history);

        $this->publisher->noteAdded($this->file(), $history[0], NoteActor::user('lina'));

        $this->assertSame(NoteNotificationPublisher::BURST_LOOKBACK, $this->sent[0]->parameters['count']);
    }

    public function testTheBurstIsLookedUpForTheActorsOwnNotesOnThisFileOnly(): void
    {
        $note = $this->note(30, 1_000);
        $this->mapper->expects($this->once())->method('findRecentByAuthor')
            ->with(7, 'lina', NoteNotificationPublisher::BURST_LOOKBACK)->willReturn([$note]);
        $this->recipients->method('forNotification')->willReturn(['owner']);

        $this->publisher->noteAdded($this->file(), $note, NoteActor::user('lina'));
    }

    public function testAGuestsBurstIsLookedUpUnderTheirMadeUpAuthorKey(): void
    {
        $actor = NoteActor::guest('Omar');
        $note = $this->note(30, 1_000, $actor->authorKey());
        $this->mapper->expects($this->once())->method('findRecentByAuthor')
            ->with(7, $actor->authorKey(), $this->anything())->willReturn([$note]);
        $this->recipients->method('forNotification')->willReturn(['owner']);

        $this->publisher->noteAdded($this->file(), $note, $actor);

        $this->assertSame(['actorKind' => 'guest', 'actor' => 'Omar'], array_intersect_key($this->sent[0]->parameters, ['actorKind' => 1, 'actor' => 1]));
    }

    public function testNothingIsDoneWhenThereIsNobodyToNotify(): void
    {
        $note = $this->note(30, 1_000);
        $this->recipients->method('forNotification')->willReturn([]);
        $this->mapper->expects($this->never())->method('findRecentByAuthor');

        $this->publisher->noteAdded($this->file(), $note, NoteActor::user('lina'));

        $this->assertSame([], $this->sent);
        $this->assertSame([], $this->dismissed);
        $this->assertSame([], $this->created);
    }

    public function testOneRecipientWhoseNotificationFailsDoesNotCostTheOthersTheirs(): void
    {
        $manager = $this->createMock(IManager::class);
        $manager->method('createNotification')->willReturnCallback(fn () => $this->newNotification());
        $manager->method('notify')->willReturnCallback(function (INotification $n): void {
            $record = $this->record($n);
            if ($record->user === 'owner') {
                throw new \RuntimeException('push gateway down');
            }
            $this->sent[] = $record;
        });
        $note = $this->note(30, 1_000);
        $this->given([$note], ['owner', 'sara']);
        $this->logger->expects($this->once())->method('warning');
        $time = $this->createMock(ITimeFactory::class);
        $time->method('getDateTime')->willReturn(new \DateTime());
        $publisher = new NoteNotificationPublisher($manager, $this->recipients, $this->mapper, $time, $this->logger);

        $publisher->noteAdded($this->file(), $note, NoteActor::user('lina'));

        $this->assertSame(['sara'], array_map(fn ($r) => $r->user, $this->sent));
    }

    public function testADeletedNotesNotificationIsDismissedForEveryoneWhoHasIt(): void
    {
        $this->publisher->noteDeleted(30);

        // The note's own notification and the mentions of it, both gone with it
        $this->assertCount(2, $this->dismissed);
        $this->assertSame(
            [NoteNotificationPublisher::OBJECT_TYPE, NoteNotificationPublisher::MENTION_OBJECT_TYPE],
            array_map(fn ($r) => $r->objectType, $this->dismissed),
        );
        foreach ($this->dismissed as $dismissed) {
            $this->assertSame('threedviewer', $dismissed->app);
            // No user: the filter matches the notification of every recipient
            $this->assertSame('', $dismissed->user);
            $this->assertSame('30', $dismissed->objectId);
        }
        $this->assertSame([], $this->sent);
    }

    public function testNotesRemovedInBulkEachHaveTheirNotificationDismissed(): void
    {
        $this->publisher->notesDeleted([4, 5, 9]);

        $this->assertSame(['4', '4', '5', '5', '9', '9'], array_map(fn ($r) => $r->objectId, $this->dismissed));
    }

    public function testFailingToDismissIsLoggedAndTheRestStillAre(): void
    {
        $manager = $this->createMock(IManager::class);
        $manager->method('createNotification')->willReturnCallback(fn () => $this->newNotification());
        $manager->method('markProcessed')->willReturnCallback(function (INotification $n): void {
            $record = $this->record($n);
            if ($record->objectId === '4') {
                throw new \RuntimeException('db gone');
            }
            $this->dismissed[] = $record;
        });
        $this->logger->expects($this->once())->method('warning');
        $publisher = new NoteNotificationPublisher($manager, $this->recipients, $this->mapper, $this->createMock(ITimeFactory::class), $this->logger);

        $publisher->notesDeleted([4, 5]);

        $this->assertSame(['5', '5'], array_map(fn ($r) => $r->objectId, $this->dismissed));
    }

    public function testAMentionNotifiesThePersonNamedAboutThatNoteAndCarriesNoText(): void
    {
        $this->recipients->method('forMention')->willReturn(['sara']);
        $note = $this->note(30, 1_000);
        $note->setPayload('{"space":"model","point":{"x":0,"y":0,"z":0},"text":"Secret words @sara"}');

        $this->publisher->mentioned($this->file(), $note, NoteActor::user('lina'), ['sara']);

        $this->assertCount(1, $this->sent);
        $sent = $this->sent[0];
        $this->assertSame('sara', $sent->user);
        $this->assertSame(NoteNotificationPublisher::SUBJECT_NOTE_MENTION, $sent->subject);
        $this->assertSame(NoteNotificationPublisher::MENTION_OBJECT_TYPE, $sent->objectType);
        $this->assertSame('30', $sent->objectId);
        $this->assertSame(['actorKind' => 'user', 'actor' => 'lina', 'fileId' => 7, 'noteId' => 30], $sent->parameters);
        $this->assertStringNotContainsString('Secret', json_encode($sent->parameters, JSON_THROW_ON_ERROR));
        // The mention the person already had for this note gives way to the new one
        $this->assertCount(1, $this->dismissed);
        $this->assertSame('sara', $this->dismissed[0]->user);
        $this->assertSame(NoteNotificationPublisher::MENTION_OBJECT_TYPE, $this->dismissed[0]->objectType);
    }

    public function testOnlyWhomTheAudienceAllowsIsNotified(): void
    {
        $this->recipients->expects($this->once())->method('forMention')
            ->with($this->anything(), $this->anything(), ['sara', 'outsider', 'lina'])
            ->willReturn(['sara']);

        $this->publisher->mentioned($this->file(), $this->note(30, 1_000), NoteActor::user('lina'), ['sara', 'outsider', 'lina']);

        $this->assertSame(['sara'], array_map(fn ($r) => $r->user, $this->sent));
    }

    public function testNoMoreThanTheLimitAreNotifiedForOneText(): void
    {
        $everyone = array_map(fn (int $i) => 'user' . $i, range(1, NoteMentions::MAX_NOTIFIED + 5));
        $this->recipients->method('forMention')->willReturn($everyone);

        $this->publisher->mentioned($this->file(), $this->note(30, 1_000), NoteActor::user('lina'), $everyone);

        $this->assertCount(NoteMentions::MAX_NOTIFIED, $this->sent);
    }

    public function testAMentionedPersonDoesNotAlsoGetTheNoteAddedNotification(): void
    {
        $note = $this->note(30, 1_000);
        $this->given([$note], ['owner', 'sara']);

        $this->publisher->noteAdded($this->file(), $note, NoteActor::user('lina'), ['sara']);

        $this->assertSame(['owner'], array_map(fn ($r) => $r->user, $this->sent));
    }

    public function testOneMentionedPersonWhoseNotificationFailsDoesNotCostTheOthers(): void
    {
        $manager = $this->createMock(IManager::class);
        $manager->method('createNotification')->willReturnCallback(fn () => $this->newNotification());
        $manager->method('notify')->willReturnCallback(function (INotification $n): void {
            $record = $this->record($n);
            if ($record->user === 'sara') {
                throw new \RuntimeException('push gateway down');
            }
            $this->sent[] = $record;
        });
        $this->recipients->method('forMention')->willReturn(['sara', 'omar']);
        $this->logger->expects($this->once())->method('warning');
        $time = $this->createMock(ITimeFactory::class);
        $time->method('getDateTime')->willReturn(new \DateTime());
        $publisher = new NoteNotificationPublisher($manager, $this->recipients, $this->mapper, $time, $this->logger);

        $publisher->mentioned($this->file(), $this->note(30, 1_000), NoteActor::user('lina'), ['sara', 'omar']);

        $this->assertSame(['omar'], array_map(fn ($r) => $r->user, $this->sent));
    }
}
