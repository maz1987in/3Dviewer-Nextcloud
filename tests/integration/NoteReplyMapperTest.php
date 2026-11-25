<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Integration;

use OCA\ThreeDViewer\Db\Note;
use OCA\ThreeDViewer\Db\NoteMapper;
use OCA\ThreeDViewer\Db\NoteReply;
use OCA\ThreeDViewer\Db\NoteReplyMapper;
use OCA\ThreeDViewer\Service\NotesService;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\Files\IRootFolder;
use OCP\IUserManager;
use OCP\Server;
use PHPUnit\Framework\TestCase;

/**
 * Note review against the real database — SQLite, MySQL and Postgres in CI: the state
 * columns the migration adds, the replies table, the lookups by note, and what happens to a
 * thread when its note or its model goes.
 */
class NoteReplyMapperTest extends TestCase
{
    private const PASSWORD = 'integration-suite-password-Aa1!';

    /** A file id no filecache row will ever have. */
    private const MISSING_FILE_ID = 2_000_000_000;

    private NoteMapper $notes;
    private NoteReplyMapper $replies;
    private string $uid;
    private int $fileId;

    protected function setUp(): void
    {
        $this->notes = Server::get(NoteMapper::class);
        $this->replies = Server::get(NoteReplyMapper::class);
        $this->uid = 'tdv-it-' . bin2hex(random_bytes(6));
        Server::get(IUserManager::class)->createUser($this->uid, self::PASSWORD);
        $this->fileId = Server::get(IRootFolder::class)->getUserFolder($this->uid)->newFile('model.stl', 'solid x')->getId();
    }

    protected function tearDown(): void
    {
        foreach ([$this->fileId, self::MISSING_FILE_ID] as $fileId) {
            foreach ($this->notes->findByFile($fileId) as $note) {
                $this->replies->deleteByNote($note->getId());
                $this->notes->delete($note);
            }
        }
        $this->replies->deleteDangling();
        Server::get(IUserManager::class)->get($this->uid)?->delete();
    }

    public function testANoteStartsOpenWithNobodyWhoResolvedIt(): void
    {
        $note = $this->note($this->fileId);

        $found = $this->notes->findInFile($this->fileId, $note->getId());

        $this->assertSame(Note::STATE_OPEN, $found->getState());
        $this->assertNull($found->getResolvedBy());
        $this->assertNull($found->getResolvedAt());
    }

    public function testResolvingIsStoredWithWhoAndWhenAndReopeningClearsIt(): void
    {
        $note = $this->note($this->fileId);

        $note->setState(Note::STATE_RESOLVED);
        $note->setResolvedBy($this->uid);
        $note->setResolvedAt(1_800_000_000);
        $this->notes->update($note);
        $resolved = $this->notes->findInFile($this->fileId, $note->getId());

        $this->assertSame(Note::STATE_RESOLVED, $resolved->getState());
        $this->assertSame($this->uid, $resolved->getResolvedBy());
        $this->assertSame(1_800_000_000, $resolved->getResolvedAt());

        $resolved->setState(Note::STATE_OPEN);
        $resolved->setResolvedBy(null);
        $resolved->setResolvedAt(null);
        $this->notes->update($resolved);
        $reopened = $this->notes->findInFile($this->fileId, $note->getId());

        $this->assertSame(Note::STATE_OPEN, $reopened->getState());
        $this->assertNull($reopened->getResolvedBy());
        $this->assertNull($reopened->getResolvedAt());
    }

    public function testRepliesComeBackOldestFirstPerNoteAndPerFile(): void
    {
        $one = $this->note($this->fileId);
        $two = $this->note($this->fileId);
        $first = $this->reply($one, 'first');
        $other = $this->reply($two, 'on the other note');
        $second = $this->reply($one, 'second');

        $this->assertSame([$first->getId(), $second->getId()], array_map(fn (NoteReply $r) => $r->getId(), $this->replies->findByNote($one->getId())));
        $this->assertSame(
            [$first->getId(), $other->getId(), $second->getId()],
            array_map(fn (NoteReply $r) => $r->getId(), $this->replies->findByFile($this->fileId)),
        );
        $this->assertSame(2, $this->replies->countByNote($one->getId()));
        $this->assertSame(1, $this->replies->countByNote($two->getId()));
    }

    public function testAReplyIsFoundOnlyInItsOwnThread(): void
    {
        $one = $this->note($this->fileId);
        $two = $this->note($this->fileId);
        $reply = $this->reply($one, 'mine');

        $this->assertSame($reply->getId(), $this->replies->findInNote($one->getId(), $reply->getId())->getId());

        $this->expectException(DoesNotExistException::class);
        $this->replies->findInNote($two->getId(), $reply->getId());
    }

    public function testATextOfTheLongestLengthAndOfEveryScriptSurvivesTheRoundTrip(): void
    {
        $note = $this->note($this->fileId);
        $text = str_repeat('Ünï 🔩 日本', 200) . "\nline two";

        $reply = $this->reply($note, $text);

        $this->assertSame($text, $this->replies->findInNote($note->getId(), $reply->getId())->getText());
    }

    public function testDeletingANoteThroughTheServiceDeletesItsRepliesAndOnlyTheirs(): void
    {
        $service = Server::get(NotesService::class);
        $gone = $this->note($this->fileId);
        $kept = $this->note($this->fileId);
        $this->reply($gone, 'goes with it');
        $this->reply($gone, 'so does this');
        $survivor = $this->reply($kept, 'stays');

        $service->delete($this->fileId, $gone->getId());

        $this->assertSame([], $this->replies->findByNote($gone->getId()));
        $this->assertSame([$survivor->getId()], array_map(fn (NoteReply $r) => $r->getId(), $this->replies->findByFile($this->fileId)));
        $this->expectException(DoesNotExistException::class);
        $this->notes->findInFile($this->fileId, $gone->getId());
    }

    public function testRepliesOfNotesTheOrphanJobRemovedAreRemovedAfterThem(): void
    {
        $kept = $this->note($this->fileId);
        $keptReply = $this->reply($kept, 'on a model that exists');
        $orphan = $this->note(self::MISSING_FILE_ID);
        $orphanReply = $this->reply($orphan, 'on a model that is gone');

        $this->notes->deleteOrphans();
        $removed = $this->replies->deleteDangling();

        $this->assertGreaterThanOrEqual(1, $removed);
        $this->assertSame([], $this->replies->findByNote($orphan->getId()), 'the thread of an orphan note');
        $this->assertSame($keptReply->getId(), $this->replies->findInNote($kept->getId(), $keptReply->getId())->getId());
        $this->assertNotSame($orphanReply->getId(), $keptReply->getId());
    }

    public function testRepliesLeftWithoutTheirNoteAreDanglingAndTheOthersAreNot(): void
    {
        $note = $this->note($this->fileId);
        $reply = $this->reply($note, 'left behind');
        $other = $this->note($this->fileId);
        $stays = $this->reply($other, 'stays');
        // An interrupted delete: the note is gone, its thread is not
        $this->notes->delete($note);

        $removed = $this->replies->deleteDangling();

        $this->assertGreaterThanOrEqual(1, $removed);
        $this->assertSame([], $this->replies->findByNote($note->getId()));
        $this->assertSame($stays->getId(), $this->replies->findInNote($other->getId(), $stays->getId())->getId());
        $this->assertNotSame($reply->getId(), $stays->getId());
    }

    private function note(int $fileId): Note
    {
        $note = new Note();
        $note->setFileId($fileId);
        $note->setType('annotation');
        $note->setPayload(json_encode(['space' => 'model', 'point' => ['x' => 0.0, 'y' => 0.0, 'z' => 0.0], 'text' => 'note']));
        $note->setAuthorUid($this->uid);
        $note->setCreatedAt(time());
        $note->setUpdatedAt(time());

        return $this->notes->insert($note);
    }

    private function reply(Note $note, string $text): NoteReply
    {
        $reply = new NoteReply();
        $reply->setNoteId($note->getId());
        $reply->setFileId($note->getFileId());
        $reply->setText($text);
        $reply->setAuthorUid($this->uid);
        $reply->setCreatedAt(time());
        $reply->setUpdatedAt(time());

        return $this->replies->insert($reply);
    }
}
