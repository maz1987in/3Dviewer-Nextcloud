<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Notification;

use OCA\ThreeDViewer\Notification\NoteNotificationPublisher;
use OCA\ThreeDViewer\Notification\Notifier;
use OCA\ThreeDViewer\Service\NoteAccess;
use OCA\ThreeDViewer\Service\NoteAccessResult;
use OCA\ThreeDViewer\Service\NoteLinks;
use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\IUserManager;
use OCP\L10N\IFactory;
use OCP\Notification\AlreadyProcessedException;
use OCP\Notification\INotification;
use OCP\Notification\UnknownNotificationException;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class NotifierTest extends TestCase
{
    private NoteAccess&MockObject $access;
    private IUserManager&MockObject $users;
    private Notifier $notifier;

    /** @var array<string, mixed> what prepare() set on the notification */
    private array $set = [];

    protected function setUp(): void
    {
        $l = $this->createMock(IL10N::class);
        $l->method('t')->willReturnArgument(0);
        $l->method('n')->willReturnCallback(
            fn (string $singular, string $plural, int $count) => str_replace('%n', (string) $count, $count === 1 ? $singular : $plural),
        );
        $factory = $this->createMock(IFactory::class);
        $factory->method('get')->willReturn($l);

        $urls = $this->createMock(IURLGenerator::class);
        $urls->method('imagePath')->willReturn('/apps/threedviewer/img/app-dark.svg');
        $urls->method('getAbsoluteURL')->willReturnCallback(fn (string $path) => 'https://cloud.test' . $path);
        $urls->method('linkToRouteAbsolute')->willReturnCallback(
            fn (string $route, array $parameters) => 'https://cloud.test/apps/threedviewer/f/' . $parameters['fileId'],
        );

        $this->users = $this->createMock(IUserManager::class);
        $this->users->method('getDisplayName')->willReturnCallback(fn (string $uid) => $uid === 'sara' ? 'Sara Ahmed' : null);

        $this->access = $this->createMock(NoteAccess::class);
        $this->access->method('forUser')->willReturn(new NoteAccessResult(false, 'bracket.step', null, 'Models/bracket.step'));

        $this->notifier = new Notifier($factory, $urls, $this->users, $this->access, new NoteLinks($urls));
    }

    /**
     * @param array<string, mixed> $parameters merged over a one-note-by-Sara set
     */
    private function notification(string $app = 'threedviewer', string $subject = 'note_added', array $parameters = [], string $user = 'owner'): INotification&MockObject
    {
        $notification = $this->createMock(INotification::class);
        $notification->method('getApp')->willReturn($app);
        $notification->method('getSubject')->willReturn($subject);
        $notification->method('getUser')->willReturn($user);
        $notification->method('getSubjectParameters')->willReturn($parameters + [
            'actorKind' => 'user', 'actor' => 'sara', 'fileId' => 7, 'noteId' => 31, 'count' => 1,
        ]);
        foreach (['setRichSubject', 'setParsedSubject', 'setLink', 'setIcon'] as $setter) {
            $notification->method($setter)->willReturnCallback(function (...$arguments) use ($setter, $notification) {
                $this->set[$setter] = $arguments;

                return $notification;
            });
        }

        return $notification;
    }

    public function testItIdentifiesItselfAsTheAppsNotifier(): void
    {
        $this->assertSame('threedviewer', $this->notifier->getID());
        $this->assertSame('3D Viewer', $this->notifier->getName());
    }

    public function testAnotherAppsNotificationIsLeftAlone(): void
    {
        $this->expectException(UnknownNotificationException::class);

        $this->notifier->prepare($this->notification('spreed'), 'en');
    }

    public function testAnUnknownSubjectOfThisAppIsLeftAlone(): void
    {
        $this->expectException(UnknownNotificationException::class);

        $this->notifier->prepare($this->notification('threedviewer', 'note_exploded'), 'en');
    }

    public function testASingleNoteByAUser(): void
    {
        $this->notifier->prepare($this->notification(), 'en');

        $this->assertSame('{user} added a note on {file}', $this->set['setRichSubject'][0]);
        $this->assertSame('Sara Ahmed added a note on bracket.step', $this->set['setParsedSubject'][0]);
    }

    public function testTheUserAndTheFileAreRichObjects(): void
    {
        $this->notifier->prepare($this->notification(), 'en');

        $rich = $this->set['setRichSubject'][1];
        $this->assertSame(['type' => 'user', 'id' => 'sara', 'name' => 'Sara Ahmed'], $rich['user']);
        $this->assertSame('file', $rich['file']['type']);
        $this->assertSame('7', $rich['file']['id']);
        $this->assertSame('bracket.step', $rich['file']['name']);
        $this->assertSame('Models/bracket.step', $rich['file']['path']);
        // No link of its own: the Notifications app makes the whole line a link to the
        // note only when none of the objects in it has one
        $this->assertArrayNotHasKey('link', $rich['file']);
        // The rich object validator accepts strings only
        foreach ($rich as $object) {
            $this->assertContainsOnly('string', $object);
        }
    }

    public function testSeveralNotesAreCountedInTheSubject(): void
    {
        $this->notifier->prepare($this->notification('threedviewer', 'note_added', ['count' => 4]), 'en');

        $this->assertSame('{user} added 4 notes on {file}', $this->set['setRichSubject'][0]);
        $this->assertSame('Sara Ahmed added 4 notes on bracket.step', $this->set['setParsedSubject'][0]);
    }

    public function testTheLinkOpensTheModelAtTheNewestNote(): void
    {
        $this->notifier->prepare($this->notification('threedviewer', 'note_added', ['count' => 3, 'noteId' => 33]), 'en');

        $this->assertSame('https://cloud.test/apps/threedviewer/f/7?note=33', $this->set['setLink'][0]);
    }

    public function testItGetsTheAppIcon(): void
    {
        $this->notifier->prepare($this->notification(), 'en');

        $this->assertSame('https://cloud.test/apps/threedviewer/img/app-dark.svg', $this->set['setIcon'][0]);
    }

    public function testAGuestIsMarkedAsOneAndNeverLinkedToAnAccount(): void
    {
        $this->notifier->prepare($this->notification('threedviewer', 'note_added', ['actorKind' => 'guest', 'actor' => 'Omar']), 'en');

        $this->assertSame('{guest} (guest) added a note on {file}', $this->set['setRichSubject'][0]);
        $this->assertSame('Omar (guest) added a note on bracket.step', $this->set['setParsedSubject'][0]);
        $rich = $this->set['setRichSubject'][1];
        $this->assertArrayNotHasKey('user', $rich);
        $this->assertSame('highlight', $rich['guest']['type']);
        $this->assertSame('Omar', $rich['guest']['name']);
        $this->assertContainsOnly('string', $rich['guest']);
    }

    public function testAGuestNameThatLooksLikeMarkupOrAUserIsPlainDataMarkedAsAGuest(): void
    {
        // A guest's name is never looked up as if it were an account
        $this->users->expects($this->never())->method('getDisplayName');

        $this->notifier->prepare($this->notification('threedviewer', 'note_added', ['actorKind' => 'guest', 'actor' => '<script>alert(1)</script> sara']), 'en');

        // Handed over as data in the rich object, where the client renders it as text; never spliced into the sentence
        $this->assertSame('{guest} (guest) added a note on {file}', $this->set['setRichSubject'][0]);
        $this->assertSame('<script>alert(1)</script> sara', $this->set['setRichSubject'][1]['guest']['name']);
        $this->assertStringContainsString('(guest)', $this->set['setParsedSubject'][0]);
    }

    public function testAnAnonymousVisitorIsNamedAsAVisitorWithTheLink(): void
    {
        $this->notifier->prepare($this->notification('threedviewer', 'note_added', ['actorKind' => 'anonymous', 'actor' => '', 'count' => 2]), 'en');

        $this->assertSame('A visitor with the link added 2 notes on {file}', $this->set['setRichSubject'][0]);
        $this->assertSame(['file'], array_keys($this->set['setRichSubject'][1]));
    }

    public function testAUserWhoNoLongerHasADisplayNameShowsTheirId(): void
    {
        $this->notifier->prepare($this->notification('threedviewer', 'note_added', ['actor' => 'ghost']), 'en');

        $this->assertSame('ghost added a note on bracket.step', $this->set['setParsedSubject'][0]);
    }

    public function testAFileTheReaderCanNoLongerOpenWithdrawsTheNotification(): void
    {
        $access = $this->createMock(NoteAccess::class);
        $access->method('forUser')->with(7, 'owner')->willReturn(null);
        $notifier = $this->notifierWith($access);

        $this->expectException(AlreadyProcessedException::class);

        $notifier->prepare($this->notification(), 'en');
    }

    /**
     * @dataProvider malformedParameters
     * @param array<string, mixed> $parameters
     */
    public function testParametersThisVersionDidNotWriteWithdrawTheNotificationInsteadOfFailing(array $parameters): void
    {
        $this->expectException(AlreadyProcessedException::class);

        $this->notifier->prepare($this->notification('threedviewer', 'note_added', $parameters), 'en');
    }

    /** @return array<string, array{0: array<string, mixed>}> */
    public static function malformedParameters(): array
    {
        return [
            'a file id that is not a number' => [['fileId' => 'x']],
            'a note id that is not a number' => [['noteId' => null]],
            'a count of zero' => [['count' => 0]],
            'a count that is not a number' => [['count' => 'many']],
        ];
    }

    public function testTheNotificationTypeMatchesWhatThePublisherWrites(): void
    {
        // The subject is the contract between the publisher and the notifier
        $this->assertSame('note_added', NoteNotificationPublisher::SUBJECT_NOTE_ADDED);
    }

    private function notifierWith(NoteAccess $access): Notifier
    {
        $l = $this->createMock(IL10N::class);
        $l->method('t')->willReturnArgument(0);
        $factory = $this->createMock(IFactory::class);
        $factory->method('get')->willReturn($l);
        $urls = $this->createMock(IURLGenerator::class);

        return new Notifier($factory, $urls, $this->users, $access, new NoteLinks($urls));
    }
}
