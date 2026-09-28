<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Db\Note;
use OCA\ThreeDViewer\Db\NoteMapper;
use OCA\ThreeDViewer\Service\AnnotationsService;
use OCA\ThreeDViewer\Service\Exception\InvalidNoteException;
use OCA\ThreeDViewer\Service\Exception\NoteLimitException;
use OCA\ThreeDViewer\Service\NotesService;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\IDBConnection;
use OCP\IUserManager;
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
    private AnnotationsService&MockObject $legacy;
    private IUserManager&MockObject $users;
    private IDBConnection&MockObject $db;
    private ILockingProvider&MockObject $locking;
    private NotesService $service;

    protected function setUp(): void
    {
        $this->mapper = $this->createMock(NoteMapper::class);
        $this->legacy = $this->createMock(AnnotationsService::class);
        $this->users = $this->createMock(IUserManager::class);
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

        $this->service->migrateLegacy(7, 'alice', true);
    }

    /** Review focus: a second tab that finds the lock held must not migrate as well. */
    public function testMigrationSkipsWhenAnotherRequestHoldsTheLock(): void
    {
        $this->legacy->method('load')->willReturn(self::LEGACY);
        $this->locking->method('acquireLock')->willThrowException(new LockedException('held'));
        $this->mapper->expects($this->never())->method('insert');

        $this->assertSame([], $this->service->migrateLegacy(7, 'alice', true));
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
