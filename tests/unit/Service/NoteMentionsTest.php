<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Service\NoteMentions;
use OCP\IUser;
use OCP\IUserManager;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class NoteMentionsTest extends TestCase
{
    private IUserManager&MockObject $users;
    private NoteMentions $mentions;

    protected function setUp(): void
    {
        $this->users = $this->createMock(IUserManager::class);
        // Accounts: sara, "Omar K" (an id with a space), and bob.o@example.com (an email id).
        // Lookup is case-insensitive, as the server's is, but the account keeps its own spelling.
        $accounts = ['sara' => 'Sara Ahmed', 'omar k' => 'Omar Khan', 'bob.o@example.com' => 'Bob O.'];
        $ids = ['sara' => 'sara', 'omar k' => 'Omar K', 'bob.o@example.com' => 'bob.o@example.com'];
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
        $this->mentions = new NoteMentions($this->users);
    }

    public function testASimpleMentionNamesAnAccount(): void
    {
        $this->assertSame(['sara'], $this->mentions->uids('Please check @sara before Friday'));
    }

    public function testAQuotedMentionMayHoldASpace(): void
    {
        $this->assertSame(['Omar K'], $this->mentions->uids('Over to @"omar k" now'));
    }

    public function testTheAccountsOwnSpellingIsWhatIsReturnedWhateverWasTyped(): void
    {
        $this->assertSame(['sara'], $this->mentions->uids('@SARA'));
        $this->assertSame(['SARA' => 'Sara Ahmed'], $this->mentions->names('@SARA'));
    }

    public function testAnIdThatNamesNobodyIsPlainText(): void
    {
        $this->assertSame([], $this->mentions->uids('Hello @nobody and @"no one"'));
        $this->assertSame([], $this->mentions->find('Hello @nobody'));
    }

    public function testAnEmailAddressIsNotAMention(): void
    {
        $this->assertSame([], $this->mentions->uids('Write to sara@example.com'));
        $this->assertSame([], $this->mentions->uids('mail me: x_sara@sara'));
    }

    public function testAnIdThatIsAnEmailAddressCanBeMentioned(): void
    {
        $this->assertSame(['bob.o@example.com'], $this->mentions->uids('cc @bob.o@example.com'));
    }

    public function testPunctuationRightAfterAMentionIsGivenBack(): void
    {
        $this->assertSame(['sara'], $this->mentions->uids('Thanks @sara.'));
        $this->assertSame(['sara'], $this->mentions->uids('(thanks @sara)'), 'a closing bracket is not part of an id');
        $this->assertSame(['sara'], $this->mentions->uids('Thanks @sara-'), 'only trailing marks are given back');
    }

    public function testEachPersonIsListedOnce(): void
    {
        $this->assertSame(['sara'], $this->mentions->uids('@sara @sara and @SARA'));
    }

    public function testASimpleMentionAtTheEndMayStillBeBeingTyped(): void
    {
        $this->assertSame([], $this->mentions->uids('Ask @sara', true), 'the last word of a note that is being typed is not settled');
        $this->assertSame(['sara'], $this->mentions->uids('Ask @sara ', true));
        $this->assertSame(['sara'], $this->mentions->uids('Ask @sara, please', true));
        $this->assertSame(['sara'], $this->mentions->uids('Ask @sara', false), 'a reply is sent whole');
    }

    public function testAQuotedMentionIsSettledByItsClosingQuote(): void
    {
        $this->assertSame(['Omar K'], $this->mentions->uids('Ask @"omar k"', true));
    }

    public function testNamesMapTheIdAsWrittenToTheDisplayName(): void
    {
        $this->assertSame(
            ['sara' => 'Sara Ahmed', 'omar k' => 'Omar Khan'],
            $this->mentions->names('@sara and @"omar k"'),
        );
    }

    public function testRedactReplacesEveryMentionAndNothingElse(): void
    {
        $this->assertSame(
            'Hi @someone, and @someone. Mail sara@example.com or @nobody',
            $this->mentions->redact('Hi @sara, and @"omar k". Mail sara@example.com or @nobody'),
        );
        $this->assertSame('No mentions here', $this->mentions->redact('No mentions here'));
    }

    public function testRedactKeepsMultibyteTextAroundTheMentionIntact(): void
    {
        $this->assertSame('Überprüfen @someone — danke', $this->mentions->redact('Überprüfen @sara — danke'));
    }

    public function testATextWithoutAnAtSignCostsNoLookups(): void
    {
        $this->users->expects($this->never())->method('get');

        $this->assertSame([], $this->mentions->find('Nothing to see'));
    }

    public function testAnAccountIsLookedUpOncePerRequest(): void
    {
        $users = $this->createMock(IUserManager::class);
        $users->expects($this->once())->method('get')->with('sara')->willReturn(null);
        $mentions = new NoteMentions($users);

        $mentions->find('@sara @sara @sara');
    }

    public function testOnlyABoundedNumberOfTokensIsLookedUp(): void
    {
        $users = $this->createMock(IUserManager::class);
        $users->expects($this->exactly(50))->method('get')->willReturn(null);
        $mentions = new NoteMentions($users);

        $mentions->find(implode(' ', array_map(fn (int $i) => '@user' . $i, range(1, 200))));
    }
}
