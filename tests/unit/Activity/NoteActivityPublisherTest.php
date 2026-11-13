<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Activity;

use OCA\ThreeDViewer\Activity\NoteActivityPublisher;
use OCA\ThreeDViewer\Activity\Provider;
use OCA\ThreeDViewer\Service\NoteActor;
use OCA\ThreeDViewer\Service\NoteLinks;
use OCA\ThreeDViewer\Service\NoteRecipients;
use OCP\Activity\IEvent;
use OCP\Activity\IManager;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\Files\File;
use OCP\IURLGenerator;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class NoteActivityPublisherTest extends TestCase
{
    private IManager&MockObject $manager;
    private NoteRecipients&MockObject $recipients;
    private LoggerInterface&MockObject $logger;
    private NoteActivityPublisher $publisher;

    /** @var list<\stdClass> the events that were published, with what was set on them */
    private array $published = [];

    /** @var list<\stdClass> */
    private array $created = [];

    protected function setUp(): void
    {
        $this->manager = $this->createMock(IManager::class);
        $this->manager->method('generateEvent')->willReturnCallback(fn () => $this->newEvent());
        $this->manager->method('publish')->willReturnCallback(function (IEvent $event): void {
            $this->published[] = $this->record($event);
        });
        $this->recipients = $this->createMock(NoteRecipients::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $time = $this->createMock(ITimeFactory::class);
        $time->method('getTime')->willReturn(1800000000);
        $urls = $this->createMock(IURLGenerator::class);
        $urls->method('linkToRouteAbsolute')->willReturnCallback(
            fn (string $route, array $parameters) => 'https://cloud.test/apps/threedviewer/f/' . $parameters['fileId'],
        );

        $this->publisher = new NoteActivityPublisher($this->manager, $this->recipients, new NoteLinks($urls), $time, $this->logger);
    }

    /** An event that remembers what was set on it, and chains like the real one. */
    private function newEvent(): IEvent
    {
        $event = $this->createMock(IEvent::class);
        $record = new \stdClass();
        $record->event = $event;
        $this->created[] = $record;

        foreach (['setApp', 'setType', 'setAffectedUser', 'setAuthor', 'setTimestamp', 'setSubject', 'setObject', 'setLink'] as $setter) {
            $event->method($setter)->willReturnCallback(function (...$arguments) use ($setter, $event, $record) {
                $record->$setter = $arguments;

                return $event;
            });
        }

        return $event;
    }

    private function record(IEvent $event): \stdClass
    {
        foreach ($this->created as $record) {
            if ($record->event === $event) {
                return $record;
            }
        }
        self::fail('An event the manager did not create');
    }

    private function file(): File
    {
        $file = $this->createMock(File::class);
        $file->method('getId')->willReturn(7);

        return $file;
    }

    public function testEveryoneWhoCanOpenTheFileGetsAnEntryWithTheirOwnPath(): void
    {
        $this->recipients->method('forStream')->willReturn(['owner' => '/Models/bracket.step', 'sara' => '/shared/bracket.step']);

        $this->publisher->publish(Provider::NOTE_ADDED, $this->file(), NoteActor::user('lina'), 31);

        $this->assertSame(['owner', 'sara'], array_map(fn ($r) => $r->setAffectedUser[0], $this->published));
        $owner = $this->published[0];
        $this->assertSame(['threedviewer'], $owner->setApp);
        $this->assertSame(['threedviewer_notes'], $owner->setType);
        $this->assertSame(['lina'], $owner->setAuthor);
        $this->assertSame([1800000000], $owner->setTimestamp);
        // Filed against the file, which is what shows it on the file's own Activity tab
        $this->assertSame(['files', 7, '/Models/bracket.step'], $owner->setObject);
        $this->assertSame(['https://cloud.test/apps/threedviewer/f/7?note=31'], $owner->setLink);
        $this->assertSame(
            ['note_added', ['actorKind' => 'user', 'actor' => 'lina', 'fileId' => 7, 'path' => '/Models/bracket.step']],
            $owner->setSubject,
        );
        $this->assertSame('/shared/bracket.step', $this->published[1]->setSubject[1]['path']);
    }

    public function testTheAuthorOfTheChangeIsRecordedAsTheEventsAuthor(): void
    {
        $this->recipients->method('forStream')->willReturn(['lina' => '/a']);

        $this->publisher->publish(Provider::NOTE_CHANGED, $this->file(), NoteActor::user('lina'), 31);

        $this->assertSame('note_changed', $this->published[0]->setSubject[0]);
        $this->assertSame(['lina'], $this->published[0]->setAuthor);
    }

    public function testAGuestHasNoAuthorAndIsRecordedByKindAndName(): void
    {
        $this->recipients->method('forStream')->willReturn(['owner' => '/a']);

        $this->publisher->publish(Provider::NOTE_ADDED, $this->file(), NoteActor::guest('Omar'), 31);

        $this->assertSame([''], $this->published[0]->setAuthor);
        $this->assertSame('guest', $this->published[0]->setSubject[1]['actorKind']);
        $this->assertSame('Omar', $this->published[0]->setSubject[1]['actor']);
    }

    public function testADeletedNoteLinksToTheModelAlone(): void
    {
        $this->recipients->method('forStream')->willReturn(['owner' => '/a']);

        $this->publisher->publish(Provider::NOTE_DELETED, $this->file(), NoteActor::user('lina'), null);

        $this->assertSame(['https://cloud.test/apps/threedviewer/f/7'], $this->published[0]->setLink);
    }

    public function testNothingOfTheNoteButItsIdLeavesThisClass(): void
    {
        $this->recipients->method('forStream')->willReturn(['owner' => '/a']);

        $this->publisher->publish(Provider::NOTE_ADDED, $this->file(), NoteActor::user('lina'), 31);

        // Subject parameters and link are all there is, and neither holds the note's text or position
        $this->assertSame(['actorKind', 'actor', 'fileId', 'path'], array_keys($this->published[0]->setSubject[1]));
    }

    public function testNobodyWhoCannotOpenTheFileIsPublishedTo(): void
    {
        $this->recipients->method('forStream')->willReturn([]);
        $this->manager->expects($this->never())->method('publish');

        $this->publisher->publish(Provider::NOTE_ADDED, $this->file(), NoteActor::user('lina'), 31);
    }

    public function testNumericUserIdsArePublishedToAsStrings(): void
    {
        $this->recipients->method('forStream')->willReturn([1234 => '/a']);

        $this->publisher->publish(Provider::NOTE_ADDED, $this->file(), NoteActor::user('lina'), 31);

        $this->assertSame(['1234'], $this->published[0]->setAffectedUser);
    }

    public function testOneReaderWhoseEntryFailsDoesNotCostTheOthersTheirs(): void
    {
        $manager = $this->createMock(IManager::class);
        $manager->method('generateEvent')->willReturnCallback(fn () => $this->newEvent());
        $manager->method('publish')->willReturnCallback(function (IEvent $event): void {
            $record = $this->record($event);
            if ($record->setAffectedUser[0] === 'owner') {
                throw new \RuntimeException('database is locked');
            }
            $this->published[] = $record;
        });
        $this->recipients->method('forStream')->willReturn(['owner' => '/a', 'sara' => '/a']);
        $this->logger->expects($this->once())->method('warning');
        $time = $this->createMock(ITimeFactory::class);
        $urls = $this->createMock(IURLGenerator::class);
        $publisher = new NoteActivityPublisher($manager, $this->recipients, new NoteLinks($urls), $time, $this->logger);

        $publisher->publish(Provider::NOTE_ADDED, $this->file(), NoteActor::user('lina'), 31);

        $this->assertSame(['sara'], array_map(fn ($r) => $r->setAffectedUser[0], $this->published));
    }
}
