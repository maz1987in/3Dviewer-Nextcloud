<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Integration;

use OCA\ThreeDViewer\Db\Note;
use OCA\ThreeDViewer\Db\NoteMapper;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\Files\IRootFolder;
use OCP\IUserManager;
use OCP\Server;
use PHPUnit\Framework\TestCase;

/**
 * NoteMapper against the real database — SQLite, MySQL and Postgres in CI.
 */
class NoteMapperTest extends TestCase
{
    private const PASSWORD = 'integration-suite-password-Aa1!';

    /** A file id no filecache row will ever have. */
    private const MISSING_FILE_ID = 2_000_000_000;

    private NoteMapper $mapper;

    private string $uid;

    private int $fileId;

    protected function setUp(): void
    {
        $this->mapper = Server::get(NoteMapper::class);
        $this->uid = 'tdv-it-' . bin2hex(random_bytes(6));
        Server::get(IUserManager::class)->createUser($this->uid, self::PASSWORD);
        $home = Server::get(IRootFolder::class)->getUserFolder($this->uid);
        $this->fileId = $home->newFile('model.stl', 'solid x')->getId();
    }

    protected function tearDown(): void
    {
        foreach ([$this->fileId, self::MISSING_FILE_ID] as $fileId) {
            foreach ($this->mapper->findByFile($fileId) as $note) {
                $this->mapper->delete($note);
            }
        }
        Server::get(IUserManager::class)->get($this->uid)?->delete();
    }

    public function testFindsNotesOfOneFileOldestFirst(): void
    {
        $first = $this->insert($this->fileId, 'first');
        $second = $this->insert($this->fileId, 'second');
        $this->insert(self::MISSING_FILE_ID, 'elsewhere');

        $ids = array_map(fn (Note $n) => $n->getId(), $this->mapper->findByFile($this->fileId));

        $this->assertSame([$first->getId(), $second->getId()], $ids);
        $this->assertSame(2, $this->mapper->countByFile($this->fileId));
    }

    public function testFindInFileRefusesANoteFromAnotherFile(): void
    {
        $note = $this->insert(self::MISSING_FILE_ID, 'elsewhere');

        $this->expectException(DoesNotExistException::class);
        $this->mapper->findInFile($this->fileId, $note->getId());
    }

    public function testDeleteOrphansKeepsNotesOfExistingFiles(): void
    {
        $kept = $this->insert($this->fileId, 'kept');
        $this->insert(self::MISSING_FILE_ID, 'orphan');

        $deleted = $this->mapper->deleteOrphans();

        $this->assertGreaterThanOrEqual(1, $deleted);
        $this->assertSame([], $this->mapper->findByFile(self::MISSING_FILE_ID));
        $this->assertSame($kept->getId(), $this->mapper->findInFile($this->fileId, $kept->getId())->getId());
    }

    private function insert(int $fileId, string $text): Note
    {
        $note = new Note();
        $note->setFileId($fileId);
        $note->setType('annotation');
        $note->setPayload(json_encode(['space' => 'model', 'point' => ['x' => 0.0, 'y' => 0.0, 'z' => 0.0], 'text' => $text]));
        $note->setAuthorUid($this->uid);
        $note->setCreatedAt(time());
        $note->setUpdatedAt(time());

        return $this->mapper->insert($note);
    }
}
