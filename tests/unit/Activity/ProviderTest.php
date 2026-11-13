<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Activity;

use OCA\ThreeDViewer\Activity\Provider;
use OCA\ThreeDViewer\Activity\Setting;
use OCA\ThreeDViewer\Service\NoteLinks;
use OCP\Activity\Exceptions\UnknownActivityException;
use OCP\Activity\IEvent;
use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\IUserManager;
use OCP\L10N\IFactory;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class ProviderTest extends TestCase
{
    private Provider $provider;

    /** @var array<string, mixed> what parse() set on the event */
    private array $set = [];

    protected function setUp(): void
    {
        $l = $this->createMock(IL10N::class);
        $l->method('t')->willReturnArgument(0);
        $factory = $this->createMock(IFactory::class);
        $factory->method('get')->willReturn($l);

        $urls = $this->createMock(IURLGenerator::class);
        $urls->method('imagePath')->willReturn('/apps/threedviewer/img/app-dark.svg');
        $urls->method('getAbsoluteURL')->willReturnCallback(fn (string $path) => 'https://cloud.test' . $path);
        $urls->method('linkToRouteAbsolute')->willReturnCallback(
            fn (string $route, array $parameters) => 'https://cloud.test/apps/threedviewer/f/' . $parameters['fileId'],
        );

        $users = $this->createMock(IUserManager::class);
        $users->method('getDisplayName')->willReturnCallback(fn (string $uid) => $uid === 'sara' ? 'Sara Ahmed' : null);

        $this->provider = new Provider($factory, $urls, $users, new NoteLinks($urls));
    }

    /**
     * @param array<string, mixed> $parameters merged over a user-Sara-on-bracket.step set
     */
    private function event(string $subject = 'note_added', array $parameters = [], string $affected = 'owner', string $app = 'threedviewer', string $type = Setting::TYPE): IEvent&MockObject
    {
        $event = $this->createMock(IEvent::class);
        $event->method('getApp')->willReturn($app);
        $event->method('getType')->willReturn($type);
        $event->method('getSubject')->willReturn($subject);
        $event->method('getAffectedUser')->willReturn($affected);
        $event->method('getObjectId')->willReturn(7);
        $event->method('getObjectName')->willReturn('/Models/bracket.step');
        $event->method('getSubjectParameters')->willReturn($parameters + [
            'actorKind' => 'user', 'actor' => 'sara', 'fileId' => 7, 'path' => '/Models/bracket.step',
        ]);
        foreach (['setRichSubject', 'setParsedSubject', 'setIcon'] as $setter) {
            $event->method($setter)->willReturnCallback(function (...$arguments) use ($setter, $event) {
                $this->set[$setter] = $arguments;

                return $event;
            });
        }

        return $event;
    }

    public function testAnotherAppsEventIsLeftAlone(): void
    {
        $this->expectException(UnknownActivityException::class);

        $this->provider->parse('en', $this->event('note_added', [], 'owner', 'files'));
    }

    public function testAnotherTypeOfThisAppIsLeftAlone(): void
    {
        $this->expectException(UnknownActivityException::class);

        $this->provider->parse('en', $this->event('note_added', [], 'owner', 'threedviewer', 'something_else'));
    }

    public function testAnUnknownSubjectIsLeftAlone(): void
    {
        $this->expectException(UnknownActivityException::class);

        $this->provider->parse('en', $this->event('note_exploded'));
    }

    /**
     * @dataProvider sentences
     */
    public function testEachSubjectForEachKindOfActor(string $subject, array $parameters, string $affected, string $rich, string $plain): void
    {
        $event = $this->event($subject, $parameters, $affected);

        $this->assertSame($event, $this->provider->parse('en', $event));

        $this->assertSame($rich, $this->set['setRichSubject'][0]);
        $this->assertSame($plain, $this->set['setParsedSubject'][0]);
    }

    /** @return array<string, array{0: string, 1: array<string, mixed>, 2: string, 3: string, 4: string}> */
    public static function sentences(): array
    {
        $guest = ['actorKind' => 'guest', 'actor' => 'Omar'];
        $anonymous = ['actorKind' => 'anonymous', 'actor' => ''];

        return [
            'added, by another user' => ['note_added', [], 'owner', '{user} added a note on {file}', 'Sara Ahmed added a note on Models/bracket.step'],
            'changed, by another user' => ['note_changed', [], 'owner', '{user} changed a note on {file}', 'Sara Ahmed changed a note on Models/bracket.step'],
            'deleted, by another user' => ['note_deleted', [], 'owner', '{user} deleted a note on {file}', 'Sara Ahmed deleted a note on Models/bracket.step'],
            'added, by the reader' => ['note_added', [], 'sara', 'You added a note on {file}', 'You added a note on Models/bracket.step'],
            'changed, by the reader' => ['note_changed', [], 'sara', 'You changed a note on {file}', 'You changed a note on Models/bracket.step'],
            'deleted, by the reader' => ['note_deleted', [], 'sara', 'You deleted a note on {file}', 'You deleted a note on Models/bracket.step'],
            'added, by a guest' => ['note_added', $guest, 'owner', '{guest} (guest) added a note on {file}', 'Omar (guest) added a note on Models/bracket.step'],
            'changed, by a guest' => ['note_changed', $guest, 'owner', '{guest} (guest) changed a note on {file}', 'Omar (guest) changed a note on Models/bracket.step'],
            'deleted, by a guest' => ['note_deleted', $guest, 'owner', '{guest} (guest) deleted a note on {file}', 'Omar (guest) deleted a note on Models/bracket.step'],
            'added, by an anonymous visitor' => ['note_added', $anonymous, 'owner', 'A visitor with the link added a note on {file}', 'A visitor with the link added a note on Models/bracket.step'],
            'changed, by an anonymous visitor' => ['note_changed', $anonymous, 'owner', 'A visitor with the link changed a note on {file}', 'A visitor with the link changed a note on Models/bracket.step'],
            'deleted, by an anonymous visitor' => ['note_deleted', $anonymous, 'owner', 'A visitor with the link deleted a note on {file}', 'A visitor with the link deleted a note on Models/bracket.step'],
        ];
    }

    public function testTheUserAndTheFileAreRichObjects(): void
    {
        $this->provider->parse('en', $this->event());

        $rich = $this->set['setRichSubject'][1];
        $this->assertSame(['type' => 'user', 'id' => 'sara', 'name' => 'Sara Ahmed'], $rich['user']);
        $this->assertSame([
            'type' => 'file',
            'id' => '7',
            'name' => 'bracket.step',
            'path' => 'Models/bracket.step',
            'link' => 'https://cloud.test/apps/threedviewer/f/7',
        ], $rich['file']);
    }

    public function testTheReaderThemselvesIsNotAnObjectInTheirOwnSentence(): void
    {
        $this->provider->parse('en', $this->event('note_added', [], 'sara'));

        $this->assertSame(['file'], array_keys($this->set['setRichSubject'][1]));
    }

    public function testAGuestIsAHighlightedNameNotAUserObject(): void
    {
        $this->provider->parse('en', $this->event('note_added', ['actorKind' => 'guest', 'actor' => '<b>sara</b>']));

        $rich = $this->set['setRichSubject'][1];
        $this->assertArrayNotHasKey('user', $rich);
        $this->assertSame('highlight', $rich['guest']['type']);
        $this->assertSame('<b>sara</b>', $rich['guest']['name']);
        $this->assertContainsOnly('string', $rich['guest']);
    }

    public function testItGetsTheAppIcon(): void
    {
        $this->provider->parse('en', $this->event());

        $this->assertSame('https://cloud.test/apps/threedviewer/img/app-dark.svg', $this->set['setIcon'][0]);
    }

    public function testTheFileComesFromTheEventWhenItsParametersAreMissing(): void
    {
        $this->provider->parse('en', $this->event('note_added', ['path' => null, 'fileId' => null]));

        $this->assertSame('Models/bracket.step', $this->set['setRichSubject'][1]['file']['path']);
        $this->assertSame('7', $this->set['setRichSubject'][1]['file']['id']);
    }
}
