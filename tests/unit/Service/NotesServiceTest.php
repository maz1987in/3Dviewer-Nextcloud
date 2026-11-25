<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Db\Note;
use OCA\ThreeDViewer\Db\NoteMapper;
use OCA\ThreeDViewer\Db\NoteReply;
use OCA\ThreeDViewer\Db\NoteReplyMapper;
use OCA\ThreeDViewer\Service\AnnotationsService;
use OCA\ThreeDViewer\Service\Exception\InvalidNoteException;
use OCA\ThreeDViewer\Service\Exception\NoteLimitException;
use OCA\ThreeDViewer\Service\NoteAccess;
use OCA\ThreeDViewer\Service\NoteAccessResult;
use OCA\ThreeDViewer\Service\NoteMentions;
use OCA\ThreeDViewer\Service\NotePeople;
use OCA\ThreeDViewer\Service\NotesService;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\IDBConnection;
use OCP\IUser;
use OCP\IUserManager;
use OCP\IUserSession;
use OCP\Lock\ILockingProvider;
use OCP\Lock\LockedException;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class NotesServiceTest extends TestCase
{
    private const LEGACY = '{"format":"threedviewer-annotations","version":1,"annotations":['
        . '{"id":1,"point":{"x":1,"y":2,"z":3},"text":"Hole","timestamp":"2026-01-02T03:04:05Z"},'
        . '{"id":2,"point":{"x":"bad","y":2,"z":3},"text":"Broken"}]}';

    private NoteMapper&MockObject $mapper;
    private NoteReplyMapper&MockObject $replies;
    private NoteMentions $mentions;
    private AnnotationsService&MockObject $legacy;
    private IUserManager&MockObject $users;
    private IDBConnection&MockObject $db;
    private ILockingProvider&MockObject $locking;
    private NotesService $service;

    protected function setUp(): void
    {
        $this->mapper = $this->createMock(NoteMapper::class);
        $this->replies = $this->createMock(NoteReplyMapper::class);
        $this->legacy = $this->createMock(AnnotationsService::class);
        $this->users = $this->createMock(IUserManager::class);
        // Whoever is mentioned can open the file and is found by the people search, so the
        // names come through; who is hidden, and why, is NoteMentionsTest's business
        $access = $this->createMock(NoteAccess::class);
        $access->method('forUser')->willReturn(new NoteAccessResult(false));
        $people = $this->createMock(NotePeople::class);
        $people->method('matching')->willReturnCallback(fn (string $query) => [$query]);
        $this->mentions = new NoteMentions($this->users, $access, $people, $this->createMock(IUserSession::class));
        $this->db = $this->createMock(IDBConnection::class);
        $this->locking = $this->createMock(ILockingProvider::class);
        $time = $this->createMock(ITimeFactory::class);
        $time->method('getTime')->willReturn(1_800_000_000);

        $this->mapper->method('insert')->willReturnCallback(function (Note $note) {
            $note->setId(99);

            return $note;
        });
        $this->mapper->method('update')->willReturnArgument(0);

        $this->service = new NotesService(
            $this->mapper,
            $this->replies,
            $this->mentions,
            $this->legacy,
            $this->users,
            $this->db,
            $this->locking,
            $time,
            $this->createMock(LoggerInterface::class),
        );
    }

    public function testCreateStoresTheNormalizedPayloadAndAuthor(): void
    {
        $this->mapper->method('countByFile')->willReturn(0);

        $note = $this->service->create(7, 'annotation', ['space' => 'model', 'point' => ['x' => 1, 'y' => 2, 'z' => 3], 'text' => 'Hi'], 'alice');

        $this->assertSame(7, $note->getFileId());
        $this->assertSame('alice', $note->getAuthorUid());
        $this->assertSame('{"space":"model","point":{"x":1.0,"y":2.0,"z":3.0},"text":"Hi"}', $note->getPayload());
        $this->assertSame(1_800_000_000, $note->getCreatedAt());
    }

    public function testCreateRefusesSceneSpace(): void
    {
        $this->mapper->method('countByFile')->willReturn(0);

        $this->expectException(InvalidNoteException::class);
        $this->service->create(7, 'annotation', ['space' => 'scene', 'point' => ['x' => 1, 'y' => 2, 'z' => 3], 'text' => ''], 'alice');
    }

    public function testCreateRefusesTheThousandAndFirstNote(): void
    {
        $this->mapper->method('countByFile')->willReturn(NotesService::MAX_NOTES_PER_FILE);
        $this->mapper->expects($this->never())->method('insert');

        $this->expectException(NoteLimitException::class);
        $this->service->create(7, 'measurement', ['space' => 'model', 'points' => [['x' => 0, 'y' => 0, 'z' => 0], ['x' => 1, 'y' => 0, 'z' => 0]]], 'alice');
    }

    public function testUpdateValidatesAgainstTheStoredType(): void
    {
        $this->mapper->method('findInFile')->with(7, 5)->willReturn($this->note(5, 'measurement', '{}'));

        $this->expectException(InvalidNoteException::class);
        $this->service->update(7, 5, ['space' => 'model', 'point' => ['x' => 0, 'y' => 0, 'z' => 0], 'text' => 'x']);
    }

    public function testUpdateReplacesPayloadAndTouchesUpdatedAt(): void
    {
        $this->mapper->method('findInFile')->willReturn($this->note(5, 'annotation', '{}'));

        $note = $this->service->update(7, 5, ['space' => 'model', 'point' => ['x' => 0, 'y' => 0, 'z' => 0], 'text' => 'new']);

        $this->assertStringContainsString('"new"', $note->getPayload());
        $this->assertSame(1_800_000_000, $note->getUpdatedAt());
    }

    public function testSerializeHidesTheAuthorWhenAsked(): void
    {
        $this->users->method('getDisplayName')->with('alice')->willReturn('Alice A.');
        $note = $this->note(5, 'annotation', '{"space":"model","point":{"x":0,"y":0,"z":0},"text":"t"}');

        $this->assertSame(['uid' => 'alice', 'displayName' => 'Alice A.'], $this->service->serialize($note, true)['author']);
        $this->assertNull($this->service->serialize($note, false)['author']);
    }

    public function testSerializeReportsADeletedAuthorAsNull(): void
    {
        $this->users->method('getDisplayName')->willReturn(null);

        $this->assertNull($this->service->serialize($this->note(5, 'annotation', '{}'), true)['author']);
    }

    public function testMigrationForAReadOnlyUserReturnsPrivateNotesAndKeepsTheDocument(): void
    {
        $this->legacy->method('load')->willReturn(self::LEGACY);
        $this->legacy->expects($this->never())->method('delete');
        $this->mapper->expects($this->never())->method('insert');

        $private = $this->service->migrateLegacy(7, 'bob', false);

        $this->assertCount(1, $private, 'the item with a non-numeric coordinate is skipped');
        $this->assertSame('private-0', $private[0]['id']);
        $this->assertSame('scene', $private[0]['payload']['space']);
        $this->assertSame('Hole', $private[0]['payload']['text']);
    }

    public function testMigrationForAnEditorMovesNotesInsideOneTransaction(): void
    {
        $this->legacy->method('load')->willReturn(self::LEGACY);
        $this->mapper->method('countByFile')->willReturn(0);
        $this->db->expects($this->once())->method('beginTransaction');
        $this->mapper->expects($this->once())->method('insert');
        $this->legacy->expects($this->once())->method('delete')->with(7, 'alice')->willReturn(true);
        $this->db->expects($this->once())->method('commit');
        $this->locking->expects($this->once())->method('releaseLock');

        $this->assertSame([], $this->service->migrateLegacy(7, 'alice', true));
    }

    public function testMigrationRollsBackWhenTheDocumentCannotBeRemoved(): void
    {
        $this->legacy->method('load')->willReturn(self::LEGACY);
        $this->mapper->method('countByFile')->willReturn(0);
        $this->legacy->method('delete')->willReturn(false);
        $this->db->expects($this->never())->method('commit');
        $this->db->expects($this->once())->method('rollBack');
        $this->locking->expects($this->once())->method('releaseLock');

        $private = $this->service->migrateLegacy(7, 'alice', true);

        $this->assertCount(1, $private, 'the failed move is handed back as private notes rather than lost');
        $this->assertSame('private-0', $private[0]['id']);
        $this->assertSame('Hole', $private[0]['payload']['text']);
    }

    /** Review focus: a second tab that finds the lock held must not migrate as well. */
    public function testMigrationSkipsWhenAnotherRequestHoldsTheLock(): void
    {
        $this->legacy->method('load')->willReturn(self::LEGACY);
        $this->locking->method('acquireLock')->willThrowException(new LockedException('held'));
        $this->mapper->expects($this->never())->method('insert');
        $this->locking->expects($this->never())->method('releaseLock');

        $this->assertSame([], $this->service->migrateLegacy(7, 'alice', true));
    }

    /**
     * A DB-backed locking provider stores the lock key in a VARCHAR(64) column; a uid from
     * LDAP or OIDC can itself be close to that length, so the key must be hashed down
     * rather than built by concatenation.
     */
    public function testMigrationUsesAShortHashedLockKeyForLongUids(): void
    {
        $uid = str_repeat('u', 64);
        $this->legacy->method('load')->willReturn(self::LEGACY);
        $this->mapper->method('countByFile')->willReturn(0);
        $this->legacy->method('delete')->willReturn(true);

        $keys = [];
        $this->locking->method('acquireLock')->willReturnCallback(function (string $key) use (&$keys) {
            $keys[] = $key;
        });
        $this->locking->method('releaseLock')->willReturnCallback(function (string $key) use (&$keys) {
            $keys[] = $key;
        });

        $this->service->migrateLegacy(7, $uid, true);

        $this->assertCount(2, $keys, 'both acquireLock and releaseLock must have been called');
        $this->assertSame($keys[0], $keys[1], 'the same key must be used to acquire and release the lock');
        $this->assertLessThanOrEqual(64, strlen($keys[0]));
    }

    public function testMigrationLeavesAnUndecodableDocumentInPlace(): void
    {
        $this->legacy->method('load')->willReturn('not valid json');
        $this->legacy->expects($this->never())->method('delete');
        $this->mapper->expects($this->never())->method('insert');
        $this->db->expects($this->never())->method('beginTransaction');

        $this->assertSame([], $this->service->migrateLegacy(7, 'alice', true));
    }

    public function testMigrationKeepsTheDocumentWhenThereIsNotEnoughRoom(): void
    {
        $this->legacy->method('load')->willReturn(self::LEGACY);
        $this->mapper->method('countByFile')->willReturn(NotesService::MAX_NOTES_PER_FILE);
        $this->mapper->expects($this->never())->method('insert');
        $this->legacy->expects($this->never())->method('delete');
        $this->db->expects($this->never())->method('beginTransaction');

        $private = $this->service->migrateLegacy(7, 'alice', true);

        $this->assertCount(1, $private);
        $this->assertSame('private-0', $private[0]['id']);
        $this->assertSame('Hole', $private[0]['payload']['text']);
    }

    /** The first request may finish the move between our first read and taking the lock. */
    public function testMigrationRereadsTheDocumentUnderTheLock(): void
    {
        $this->legacy->method('load')->willReturnOnConsecutiveCalls(self::LEGACY, null);
        $this->mapper->expects($this->never())->method('insert');
        $this->db->expects($this->never())->method('beginTransaction');

        $this->service->migrateLegacy(7, 'alice', true);
    }

    public function testMigrationWithoutALegacyDocumentDoesNothing(): void
    {
        $this->legacy->method('load')->willReturn(null);
        $this->locking->expects($this->never())->method('acquireLock');

        $this->assertSame([], $this->service->migrateLegacy(7, 'alice', true));
    }

    public function testANewNoteIsOpen(): void
    {
        $this->mapper->method('countByFile')->willReturn(0);

        $note = $this->service->create(7, 'annotation', ['space' => 'model', 'point' => ['x' => 1, 'y' => 2, 'z' => 3], 'text' => 'Hi'], 'alice');

        $serialized = $this->service->serialize($note, true);
        $this->assertSame('open', $serialized['state']);
        $this->assertNull($serialized['resolvedBy']);
        $this->assertNull($serialized['resolvedAt']);
        $this->assertSame([], $serialized['replies']);
    }

    public function testResolvingRecordsWhoAndWhenAndReopeningClearsIt(): void
    {
        $note = $this->note(5, 'annotation', '{}');
        $this->mapper->method('findInFile')->willReturn($note);

        [$resolved, $changed] = $this->service->changeState(7, 5, 'resolved', 'omar');

        $this->assertTrue($changed);
        $this->assertSame('resolved', $resolved->getState());
        $this->assertSame('omar', $resolved->getResolvedBy());
        $this->assertSame(1_800_000_000, $resolved->getResolvedAt());
        $this->assertSame(1, $resolved->getUpdatedAt(), 'resolving is not an edit of the note');

        [$reopened, $changed] = $this->service->changeState(7, 5, 'open', 'lina');

        $this->assertTrue($changed);
        $this->assertSame('open', $reopened->getState());
        $this->assertNull($reopened->getResolvedBy());
        $this->assertNull($reopened->getResolvedAt());
    }

    public function testChangingToTheStateItAlreadyHasChangesNothing(): void
    {
        $this->mapper->method('findInFile')->willReturn($this->note(5, 'annotation', '{}'));
        $this->mapper->expects($this->never())->method('update');

        [, $changed] = $this->service->changeState(7, 5, 'open', 'omar');

        $this->assertFalse($changed);
    }

    public function testAnUnknownStateIsRefused(): void
    {
        $this->mapper->expects($this->never())->method('update');

        $this->expectException(InvalidNoteException::class);
        $this->service->changeState(7, 5, 'archived', 'omar');
    }

    public function testASerializedResolvedNoteSaysWhoResolvedItButNotOnAPublicLink(): void
    {
        $this->users->method('getDisplayName')->willReturnMap([['alice', 'Alice A.'], ['omar', 'Omar O.']]);
        $note = $this->note(5, 'annotation', '{"space":"model","point":{"x":0,"y":0,"z":0},"text":"t"}');
        $note->setState('resolved');
        $note->setResolvedBy('omar');
        $note->setResolvedAt(1_799_999_000);

        $signedIn = $this->service->serialize($note, true);
        $public = $this->service->serialize($note, false);

        $this->assertSame('resolved', $signedIn['state']);
        $this->assertSame(['uid' => 'omar', 'displayName' => 'Omar O.'], $signedIn['resolvedBy']);
        $this->assertSame(1_799_999_000, $signedIn['resolvedAt']);
        $this->assertSame('resolved', $public['state']);
        $this->assertSame(1_799_999_000, $public['resolvedAt']);
        $this->assertNull($public['resolvedBy']);
        $this->assertStringNotContainsString('omar', json_encode($public, JSON_THROW_ON_ERROR));
    }

    public function testAReplyIsStoredInTheNotesThreadWithItsAuthor(): void
    {
        $this->mapper->method('findInFile')->with(7, 5)->willReturn($this->note(5, 'annotation', '{}'));
        $this->replies->method('countByNote')->willReturn(0);
        $this->replies->method('insert')->willReturnCallback(function (NoteReply $reply) {
            $reply->setId(11);

            return $reply;
        });

        $reply = $this->service->addReply(7, 5, 'Looks fine', 'omar');

        $this->assertSame(5, $reply->getNoteId());
        $this->assertSame(7, $reply->getFileId());
        $this->assertSame('Looks fine', $reply->getText());
        $this->assertSame('omar', $reply->getAuthorUid());
        $this->assertSame(1_800_000_000, $reply->getCreatedAt());
    }

    public function testAReplyToAResolvedNoteLeavesItResolved(): void
    {
        $note = $this->note(5, 'annotation', '{}');
        $note->setState('resolved');
        $note->setResolvedBy('lina');
        $this->mapper->method('findInFile')->willReturn($note);
        $this->replies->method('countByNote')->willReturn(1);
        $this->replies->method('insert')->willReturnArgument(0);
        $this->mapper->expects($this->never())->method('update');

        $this->service->addReply(7, 5, 'Thanks', 'omar');

        $this->assertSame('resolved', $note->getState());
        $this->assertSame('lina', $note->getResolvedBy());
    }

    public function testAReplyNeedsTextWithinTheLimit(): void
    {
        $this->mapper->method('findInFile')->willReturn($this->note(5, 'annotation', '{}'));
        $this->replies->expects($this->never())->method('insert');

        foreach (['', "  \n ", null, ['x'], str_repeat('a', 2001)] as $bad) {
            try {
                $this->service->addReply(7, 5, $bad, 'omar');
                $this->fail('A reply of ' . json_encode($bad) . ' was accepted');
            } catch (InvalidNoteException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function testAReplyToANoteOnAnotherModelIsRefused(): void
    {
        $this->mapper->method('findInFile')->willThrowException(new DoesNotExistException(''));
        $this->replies->expects($this->never())->method('insert');

        $this->expectException(DoesNotExistException::class);
        $this->service->addReply(8, 5, 'Hi', 'omar');
    }

    public function testAThreadHasALimit(): void
    {
        $this->mapper->method('findInFile')->willReturn($this->note(5, 'annotation', '{}'));
        $this->replies->method('countByNote')->willReturn(NotesService::MAX_REPLIES_PER_NOTE);
        $this->replies->expects($this->never())->method('insert');

        $this->expectException(NoteLimitException::class);
        $this->service->addReply(7, 5, 'One more', 'omar');
    }

    public function testEditingAReplyChangesItsTextAndTouchesIt(): void
    {
        $reply = new NoteReply();
        $reply->setId(11);
        $reply->setNoteId(5);
        $reply->setText('Old');
        $reply->setUpdatedAt(1);
        $this->mapper->method('findInFile')->willReturn($this->note(5, 'annotation', '{}'));
        $this->replies->method('findInNote')->with(5, 11)->willReturn($reply);
        $this->replies->method('update')->willReturnArgument(0);

        $edited = $this->service->updateReply(7, 5, 11, 'New');

        $this->assertSame('New', $edited->getText());
        $this->assertSame(1_800_000_000, $edited->getUpdatedAt());
    }

    public function testAReplyIdFromAnotherThreadIsNotFound(): void
    {
        $this->mapper->method('findInFile')->willReturn($this->note(5, 'annotation', '{}'));
        $this->replies->method('findInNote')->with(5, 11)->willThrowException(new DoesNotExistException(''));
        $this->replies->expects($this->never())->method('delete');
        $this->replies->expects($this->never())->method('update');

        try {
            $this->service->deleteReply(7, 5, 11);
            $this->fail('The reply was found');
        } catch (DoesNotExistException) {
            $this->addToAssertionCount(1);
        }

        $this->expectException(DoesNotExistException::class);
        $this->service->updateReply(7, 5, 11, 'Hi');
    }

    public function testDeletingANoteDeletesItsRepliesInTheSameTransaction(): void
    {
        $note = $this->note(5, 'annotation', '{}');
        $this->mapper->method('findInFile')->willReturn($note);
        $calls = [];
        $this->db->expects($this->once())->method('beginTransaction')->willReturnCallback(function () use (&$calls) {
            $calls[] = 'begin';
        });
        $this->replies->expects($this->once())->method('deleteByNote')->with(5)->willReturnCallback(function () use (&$calls): void {
            $calls[] = 'replies';
        });
        $this->mapper->expects($this->once())->method('delete')->with($note)->willReturnCallback(function () use (&$calls, $note) {
            $calls[] = 'note';

            return $note;
        });
        $this->db->expects($this->once())->method('commit')->willReturnCallback(function () use (&$calls) {
            $calls[] = 'commit';
        });

        $this->service->delete(7, 5);

        $this->assertSame(['begin', 'replies', 'note', 'commit'], $calls);
    }

    public function testAFailedDeleteRollsBackAndSurfacesTheError(): void
    {
        $this->mapper->method('findInFile')->willReturn($this->note(5, 'annotation', '{}'));
        $this->replies->method('deleteByNote')->willThrowException(new \RuntimeException('db gone'));
        $this->db->expects($this->once())->method('rollBack');
        $this->db->expects($this->never())->method('commit');
        $this->mapper->expects($this->never())->method('delete');

        $this->expectException(\RuntimeException::class);
        $this->service->delete(7, 5);
    }

    public function testASignedInReaderGetsMentionsAsNamesAndAPublicVisitorGetsNone(): void
    {
        $bob = $this->createMock(IUser::class);
        $bob->method('getUID')->willReturn('bob');
        $bob->method('getDisplayName')->willReturn('Bob B.');
        $this->users->method('get')->willReturnCallback(fn (string $uid) => $uid === 'bob' ? $bob : null);
        $this->users->method('getDisplayName')->willReturn('Alice A.');
        $note = $this->note(5, 'annotation', '{"space":"model","point":{"x":0,"y":0,"z":0},"text":"Check @bob. please"}');
        $reply = new NoteReply();
        $reply->setId(11);
        $reply->setNoteId(5);
        $reply->setFileId(7);
        $reply->setText('Thanks @bob');
        $reply->setAuthorUid('alice');
        $reply->setCreatedAt(2);
        $reply->setUpdatedAt(2);

        $signedIn = $this->service->serialize($note, true, [$reply]);
        $public = $this->service->serialize($note, false, [$reply]);

        $this->assertSame(['bob' => 'Bob B.'], $signedIn['mentions']);
        $this->assertSame('Check @bob. please', $signedIn['payload']['text'], 'the stored text keeps the id');
        $this->assertSame(['bob' => 'Bob B.'], $signedIn['replies'][0]['mentions']);
        $this->assertSame('Check @someone. please', $public['payload']['text']);
        $this->assertSame('Thanks @someone', $public['replies'][0]['text']);
        $this->assertNull($public['replies'][0]['author']);
        $json = json_encode($public, JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString('bob', $json);
        $this->assertStringNotContainsString('Bob', $json);
        $this->assertStringNotContainsString('alice', $json);
    }

    private function note(int $id, string $type, string $payload): Note
    {
        $note = new Note();
        $note->setId($id);
        $note->setFileId(7);
        $note->setType($type);
        $note->setPayload($payload);
        $note->setAuthorUid('alice');
        $note->setCreatedAt(1);
        $note->setUpdatedAt(1);

        return $note;
    }
}
