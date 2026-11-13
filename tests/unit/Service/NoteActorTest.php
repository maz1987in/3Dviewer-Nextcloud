<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Service\NoteActor;
use PHPUnit\Framework\TestCase;

class NoteActorTest extends TestCase
{
    public function testAUserIsKnownByTheirIdEverywhere(): void
    {
        $actor = NoteActor::user('sara');

        $this->assertTrue($actor->isUser());
        $this->assertSame('sara', $actor->authorKey());
        $this->assertSame('sara', $actor->activityAuthor());
        $this->assertSame(['actorKind' => 'user', 'actor' => 'sara'], $actor->toParameters());
    }

    public function testAGuestIsNeverFiledAsAUserAndHasNoActivityAuthor(): void
    {
        $actor = NoteActor::guest('Sara');

        $this->assertFalse($actor->isUser());
        $this->assertSame('', $actor->activityAuthor());
        // A namespace user ids do not use, so a guest named like a user is not that user
        $this->assertStringStartsWith('guest:', $actor->authorKey());
        $this->assertNotSame(NoteActor::user('Sara')->authorKey(), $actor->authorKey());
    }

    public function testTheSameGuestNameGivesTheSameKeyAndAnotherNameAnotherKey(): void
    {
        $this->assertSame(NoteActor::guest('Sara')->authorKey(), NoteActor::guest("  Sara\n")->authorKey());
        $this->assertNotSame(NoteActor::guest('Sara')->authorKey(), NoteActor::guest('Omar')->authorKey());
    }

    /**
     * @dataProvider blankNames
     */
    public function testANameThatIsBlankAfterCleaningLeavesTheVisitorAnonymous(?string $name): void
    {
        $actor = NoteActor::guest($name);

        $this->assertSame(NoteActor::ANONYMOUS, $actor->kind);
        $this->assertSame('', $actor->value);
        $this->assertSame('guest:anonymous', $actor->authorKey());
    }

    /** @return array<string, array{0: ?string}> */
    public static function blankNames(): array
    {
        return [
            'null' => [null],
            'empty' => [''],
            'spaces' => ["  \t "],
            'control characters' => ["\x00\x07\x1b"],
            'only invisible format characters' => ["\u{202E}\u{200B}"],
        ];
    }

    public function testAGuestNameIsCleanedToPlainTextOnOneLine(): void
    {
        $actor = NoteActor::guest("  Sara\r\n  \u{202E}Admin\x00 ");

        // Line breaks and the right-to-left override, which makes a name read backwards, are gone
        $this->assertSame('Sara Admin', $actor->value);
    }

    public function testAGuestNameIsCutToItsLimitByCharactersNotBytes(): void
    {
        $actor = NoteActor::guest(str_repeat('é', 200));

        $this->assertSame(NoteActor::MAX_GUEST_NAME_CHARS, mb_strlen($actor->value));
    }

    public function testMarkupInANameIsKeptAsText(): void
    {
        // Escaping is the job of whatever shows the name; here it must survive as data, not be mangled or interpreted
        $this->assertSame('<b>x</b> & "y"', NoteActor::guest('<b>x</b> & "y"')->value);
    }

    public function testRebuildsWhatItStored(): void
    {
        foreach ([NoteActor::user('sara'), NoteActor::guest('Sara'), NoteActor::guest(null)] as $actor) {
            $parameters = $actor->toParameters();
            $rebuilt = NoteActor::fromParameters($parameters['actorKind'], $parameters['actor']);

            $this->assertSame($actor->kind, $rebuilt->kind);
            $this->assertSame($actor->value, $rebuilt->value);
        }
    }

    /**
     * @dataProvider malformedParameters
     */
    public function testMalformedStoredParametersRenderAsAnAnonymousVisitor(mixed $kind, mixed $value): void
    {
        $this->assertSame(NoteActor::ANONYMOUS, NoteActor::fromParameters($kind, $value)->kind);
    }

    /** @return array<string, array{0: mixed, 1: mixed}> */
    public static function malformedParameters(): array
    {
        return [
            'nothing' => [null, null],
            'a user without an id' => ['user', ''],
            'a user with a non-string id' => ['user', 7],
            'an unknown kind' => ['admin', 'sara'],
            'a guest with a non-string name' => ['guest', ['x']],
        ];
    }
}
