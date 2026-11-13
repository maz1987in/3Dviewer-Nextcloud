<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Db\NoteMapper;
use OCA\ThreeDViewer\Service\NoteAccess;
use OCA\ThreeDViewer\Service\NoteAccessResult;
use OCA\ThreeDViewer\Service\NoteActor;
use OCA\ThreeDViewer\Service\NoteRecipients;
use OCP\Files\File;
use OCP\IUser;
use OCP\Share\IShareHelper;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class NoteRecipientsTest extends TestCase
{
    private IShareHelper&MockObject $shares;
    private NoteMapper&MockObject $mapper;
    private NoteAccess&MockObject $access;
    private NoteRecipients $recipients;

    /** @var list<string> the users who can still open the file, as NoteAccess sees it */
    private array $canOpen = [];

    protected function setUp(): void
    {
        $this->shares = $this->createMock(IShareHelper::class);
        $this->mapper = $this->createMock(NoteMapper::class);
        $this->access = $this->createMock(NoteAccess::class);
        $this->access->method('forUser')->willReturnCallback(
            fn (int $fileId, string $uid) => in_array($uid, $this->canOpen, true) ? new NoteAccessResult(false, 'bracket.step') : null,
        );
        $this->recipients = new NoteRecipients($this->shares, $this->mapper, $this->access);
    }

    private function file(?string $owner = 'owner'): File
    {
        $file = $this->createMock(File::class);
        $file->method('getId')->willReturn(7);
        if ($owner === null) {
            $file->method('getOwner')->willReturn(null);
        } else {
            $user = $this->createMock(IUser::class);
            $user->method('getUID')->willReturn($owner);
            $file->method('getOwner')->willReturn($user);
        }

        return $file;
    }

    // The stream

    public function testTheStreamGoesToEveryoneTheServerSaysCanOpenTheFile(): void
    {
        $this->shares->method('getPathsForAccessList')->willReturn([
            'users' => ['owner' => '/Models/bracket.step', 'sara' => '/shared/bracket.step'],
            'remotes' => ['someone@remote.example' => '/x'],
        ]);

        $this->assertSame(
            ['owner' => '/Models/bracket.step', 'sara' => '/shared/bracket.step'],
            $this->recipients->forStream($this->file()),
        );
    }

    public function testTheStreamIncludesTheAuthorOfTheChange(): void
    {
        $this->shares->method('getPathsForAccessList')->willReturn(['users' => ['sara' => 'bracket.step']]);

        // The stream is a log of what happened to the file, and shows people their own actions
        $this->assertArrayHasKey('sara', $this->recipients->forStream($this->file()));
    }

    public function testTheStreamGivesEveryPathALeadingSlashAndKeepsNumericUserIdsStrings(): void
    {
        // PHP turns a numeric array key into an int, so a user called 1234 arrives as one
        $this->shares->method('getPathsForAccessList')->willReturn(['users' => [1234 => 'bracket.step']]);

        $paths = $this->recipients->forStream($this->file());

        $this->assertSame(['1234' => '/bracket.step'], $paths);
        $this->assertSame('1234', (string) array_key_first($paths));
    }

    public function testAFileNobodyCanOpenHasNoAudience(): void
    {
        $this->shares->method('getPathsForAccessList')->willReturn(['users' => []]);

        $this->assertSame([], $this->recipients->forStream($this->file()));
    }

    public function testAFileSharedWithAHugeGroupReachesOnlyThePeopleWithAStakeInItsNotes(): void
    {
        $users = ['owner' => '/a', 'sara' => '/a', 'lurker' => '/a'];
        for ($i = 0; $i < NoteRecipients::MAX_STREAM_RECIPIENTS; $i++) {
            $users['member' . $i] = '/a';
        }
        $this->shares->method('getPathsForAccessList')->willReturn(['users' => $users]);
        $this->mapper->method('findAuthorUids')->willReturn(['sara', 'revoked']);

        $paths = $this->recipients->forStream($this->file());

        // The owner and a note author who can open the file; a former author who can't is not invented
        $this->assertSame(['owner', 'sara'], array_keys($paths));
    }

    // Notifications

    public function testNotificationsGoToTheOwnerAndToPeopleWhoWroteNotesBefore(): void
    {
        $this->canOpen = ['owner', 'sara', 'omar'];
        $this->mapper->method('findAuthorUids')->willReturn(['sara', 'omar']);

        $this->assertSame(['owner', 'sara', 'omar'], $this->recipients->forNotification($this->file(), NoteActor::user('lina')));
    }

    public function testTheAuthorOfTheChangeIsNeverNotified(): void
    {
        $this->canOpen = ['owner', 'sara'];
        $this->mapper->method('findAuthorUids')->willReturn(['sara']);

        $this->assertSame(['owner'], $this->recipients->forNotification($this->file(), NoteActor::user('sara')));
    }

    public function testTheOwnerIsNotNotifiedOfTheirOwnNote(): void
    {
        $this->canOpen = ['owner', 'sara'];
        $this->mapper->method('findAuthorUids')->willReturn(['sara', 'owner']);

        $this->assertSame(['sara'], $this->recipients->forNotification($this->file(), NoteActor::user('owner')));
    }

    public function testSomeoneWhoCanNoLongerOpenTheFileIsNotNotified(): void
    {
        // Sara wrote a note last month and has since lost access: she must hear nothing about the model
        $this->canOpen = ['owner'];
        $this->mapper->method('findAuthorUids')->willReturn(['sara']);

        $this->assertSame(['owner'], $this->recipients->forNotification($this->file(), NoteActor::user('lina')));
    }

    public function testAnAuthorWhoWasDeletedIsNotNotified(): void
    {
        // NoteAccess answers null for an account that no longer exists
        $this->canOpen = ['owner'];
        $this->mapper->method('findAuthorUids')->willReturn(['deleted-user']);

        $this->assertSame(['owner'], $this->recipients->forNotification($this->file(), NoteActor::user('lina')));
    }

    public function testEachPersonIsNotifiedOnceHoweverManyWaysTheyQualify(): void
    {
        $this->canOpen = ['owner', 'sara'];
        $this->mapper->method('findAuthorUids')->willReturn(['sara', 'owner', 'sara']);

        $this->assertSame(['owner', 'sara'], $this->recipients->forNotification($this->file(), NoteActor::user('lina')));
    }

    public function testAFileWithoutAnOwnerStillReachesItsNoteAuthors(): void
    {
        $this->canOpen = ['sara'];
        $this->mapper->method('findAuthorUids')->willReturn(['sara']);

        $this->assertSame(['sara'], $this->recipients->forNotification($this->file(null), NoteActor::user('lina')));
    }

    public function testAGuestsChangeNotifiesTheOwnerAndPreviousAuthorsButNeverAGuestKey(): void
    {
        $this->canOpen = ['owner', 'sara'];
        // Notes a visitor made are filed under a made-up key, which is not an account
        $this->mapper->method('findAuthorUids')->willReturn(['sara', NoteActor::guest('Omar')->authorKey()]);

        $recipients = $this->recipients->forNotification($this->file(), NoteActor::guest('Omar'));

        $this->assertSame(['owner', 'sara'], $recipients);
    }

    public function testNobodyToNotifyIsAnEmptyList(): void
    {
        $this->canOpen = [];
        $this->mapper->method('findAuthorUids')->willReturn([]);

        $this->assertSame([], $this->recipients->forNotification($this->file(), NoteActor::user('owner')));
    }
}
