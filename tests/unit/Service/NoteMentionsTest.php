<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Service\NoteAccess;
use OCA\ThreeDViewer\Service\NoteAccessResult;
use OCA\ThreeDViewer\Service\NoteMentions;
use OCA\ThreeDViewer\Service\NotePeople;
use OCP\IUser;
use OCP\IUserManager;
use OCP\IUserSession;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class NoteMentionsTest extends TestCase
{
    private const FILE = 7;

    private IUserManager&MockObject $users;
    private IUserSession&MockObject $session;
    private NotePeople&MockObject $people;
    private NoteMentions $mentions;

    /** @var list<string> accounts that exist but cannot open the file */
    private array $noAccess = [];

    /** @var list<string> accounts the people search does not find for this reader (group or enumeration rules) */
    private array $hidden = [];

    /** @var int[] every file id access was asked about */
    private array $asked = [];

    protected function setUp(): void
    {
        $this->users = $this->createMock(IUserManager::class);
        // Accounts: sara, "Omar K" (an id with a space), and bob.o@example.com (an email id).
        // Lookup is case-insensitive, as the server's is, but the account keeps its own spelling.
        $accounts = ['sara' => 'Sara Ahmed', 'omar k' => 'Omar Khan', 'bob.o@example.com' => 'Bob O.', 'lina' => 'Lina'];
        $ids = ['sara' => 'sara', 'omar k' => 'Omar K', 'bob.o@example.com' => 'bob.o@example.com', 'lina' => 'lina'];
        $this->users->method('get')->willReturnCallback(function (string $uid) use ($accounts, $ids) {
            $key = strtolower($uid);
            if (!isset($accounts[$key])) {
                return null;
            }
            $user = $this->createMock(IUser::class);
            $user->method('getUID')->willReturn($ids[$key]);
            $user->method('getDisplayName')->willReturn($accounts[$key]);

            return $user;
        });

        $access = $this->createMock(NoteAccess::class);
        $access->method('forUser')->willReturnCallback(function (int $fileId, string $uid) {
            $this->asked[] = $fileId;

            return $fileId === self::FILE && !in_array($uid, $this->noAccess, true) ? new NoteAccessResult(false) : null;
        });
        $this->people = $this->createMock(NotePeople::class);
        // The search finds whoever was asked for, unless the rules hide them from this reader
        $this->people->method('matching')->willReturnCallback(
            fn (string $query) => array_values(array_filter(
                ['sara', 'Omar K', 'bob.o@example.com', 'lina'],
                fn (string $uid) => strcasecmp($uid, $query) === 0 && !in_array($uid, $this->hidden, true),
            )),
        );
        $this->session = $this->createMock(IUserSession::class);
        $reader = $this->createMock(IUser::class);
        $reader->method('getUID')->willReturn('lina');
        $this->session->method('getUser')->willReturn($reader);

        $this->mentions = new NoteMentions($this->users, $access, $this->people, $this->session);
    }

    private function uids(string $text, bool $settledOnly = false): array
    {
        return $this->mentions->uids($text, self::FILE, $settledOnly);
    }

    public function testASimpleMentionNamesAnAccount(): void
    {
        $this->assertSame(['sara'], $this->uids('Please check @sara before Friday'));
    }

    public function testAQuotedMentionMayHoldASpace(): void
    {
        $this->assertSame(['Omar K'], $this->uids('Over to @"omar k" now'));
    }

    public function testTheAccountsOwnSpellingIsWhatIsReturnedWhateverWasTyped(): void
    {
        $this->assertSame(['sara'], $this->uids('@SARA'));
        $this->assertSame(['SARA' => 'Sara Ahmed'], $this->mentions->names('@SARA', self::FILE));
    }

    public function testAnIdThatNamesNobodyIsPlainText(): void
    {
        $this->assertSame([], $this->uids('Hello @nobody and @"no one"'));
        $this->assertSame([], $this->mentions->find('Hello @nobody', self::FILE));
    }

    /**
     * A note's author must not be able to learn who has an account, or who can open a file,
     * by writing an id and seeing whether it turns into a name: both come back exactly as
     * if nobody had that name.
     */
    public function testAnAccountWithoutAccessToTheFileIsIndistinguishableFromOneThatDoesNotExist(): void
    {
        $this->noAccess = ['sara'];
        $text = 'Hello @sara and @nobody';

        $this->assertSame([], $this->uids($text));
        $this->assertSame([], $this->mentions->names($text, self::FILE));
        $this->assertSame([], $this->mentions->find($text, self::FILE));
        $this->assertSame($this->mentions->find('Hello @sara', self::FILE), $this->mentions->find('Hello @nobody', self::FILE));
    }

    public function testAnAccountTheReaderCannotFindThroughThePeopleSearchIsNotNamed(): void
    {
        // The administrator's rules (enumeration, same group only) keep sara from this reader
        $this->hidden = ['sara'];

        $this->assertSame([], $this->uids('Hello @sara'));
        $this->assertSame([], $this->mentions->names('Hello @sara', self::FILE));
        $this->assertSame(['Omar K'], $this->uids('Hello @sara and @"omar k"'));
    }

    public function testAPersonWhoCanOpenAnotherFileIsNotNamedOnThisOne(): void
    {
        $this->assertSame([], $this->mentions->uids('Hello @sara', 8));
    }

    public function testTheReaderIsAlwaysShownThemselves(): void
    {
        $this->hidden = ['lina'];

        $this->assertSame(['lina'], $this->uids('Note to self @lina'));
    }

    public function testAnEmailAddressIsNotAMention(): void
    {
        $this->assertSame([], $this->uids('Write to sara@example.com'));
        $this->assertSame([], $this->uids('mail me: x_sara@sara'));
    }

    public function testAnIdThatIsAnEmailAddressCanBeMentioned(): void
    {
        $this->assertSame(['bob.o@example.com'], $this->uids('cc @bob.o@example.com'));
    }

    public function testPunctuationRightAfterAMentionIsGivenBack(): void
    {
        $this->assertSame(['sara'], $this->uids('Thanks @sara.'));
        $this->assertSame(['sara'], $this->uids('(thanks @sara)'), 'a closing bracket is not part of an id');
        $this->assertSame(['sara'], $this->uids('Thanks @sara-'), 'only trailing marks are given back');
    }

    public function testEachPersonIsListedOnce(): void
    {
        $this->assertSame(['sara'], $this->uids('@sara @sara and @SARA'));
    }

    public function testASimpleMentionAtTheEndMayStillBeBeingTyped(): void
    {
        $this->assertSame([], $this->uids('Ask @sara', true), 'the last word of a note that is being typed is not settled');
        $this->assertSame(['sara'], $this->uids('Ask @sara ', true));
        $this->assertSame(['sara'], $this->uids('Ask @sara, please', true));
        $this->assertSame(['sara'], $this->uids('Ask @sara', false), 'a reply is sent whole');
    }

    public function testAQuotedMentionIsSettledByItsClosingQuote(): void
    {
        $this->assertSame(['Omar K'], $this->uids('Ask @"omar k"', true));
    }

    public function testNamesMapTheIdAsWrittenToTheDisplayName(): void
    {
        $this->assertSame(
            ['sara' => 'Sara Ahmed', 'omar k' => 'Omar Khan'],
            $this->mentions->names('@sara and @"omar k"', self::FILE),
        );
    }

    /** A public link: no lookup, so nothing about accounts or access can be told from the answer */
    public function testRedactReplacesEveryMentionShapedTokenWhetherOrNotItNamesAnyone(): void
    {
        $users = $this->createMock(IUserManager::class);
        $users->expects($this->never())->method('get');
        $this->people->expects($this->never())->method('matching');
        $mentions = new NoteMentions($users, $this->createMock(NoteAccess::class), $this->people, $this->session);

        $this->assertSame(
            'Hi @someone, and @someone. Mail sara@example.com or @someone',
            $mentions->redact('Hi @sara, and @"omar k". Mail sara@example.com or @nobody'),
        );
        $this->assertSame('No mentions here', $mentions->redact('No mentions here'));
    }

    public function testRedactGivesBackThePunctuationAfterAMention(): void
    {
        $this->assertSame('Thanks @someone. And @someone-', $this->mentions->redact('Thanks @sara. And @omar-'));
    }

    public function testRedactKeepsMultibyteTextAroundTheMentionIntact(): void
    {
        $this->assertSame('Überprüfen @someone — danke', $this->mentions->redact('Überprüfen @sara — danke'));
    }

    public function testATextWithoutAnAtSignCostsNoLookups(): void
    {
        $this->users->expects($this->never())->method('get');

        $this->assertSame([], $this->mentions->find('Nothing to see', self::FILE));
    }

    public function testAnAccountIsLookedUpOncePerRequestAndFile(): void
    {
        $users = $this->createMock(IUserManager::class);
        $users->expects($this->once())->method('get')->with('sara')->willReturn(null);
        $mentions = new NoteMentions($users, $this->createMock(NoteAccess::class), $this->people, $this->session);

        $mentions->find('@sara @sara @sara', self::FILE);
    }

    public function testOnlyABoundedNumberOfTokensIsLookedUp(): void
    {
        $users = $this->createMock(IUserManager::class);
        $users->expects($this->exactly(50))->method('get')->willReturn(null);
        $mentions = new NoteMentions($users, $this->createMock(NoteAccess::class), $this->people, $this->session);

        $mentions->find(implode(' ', array_map(fn (int $i) => '@user' . $i, range(1, 200))), self::FILE);
    }
}
