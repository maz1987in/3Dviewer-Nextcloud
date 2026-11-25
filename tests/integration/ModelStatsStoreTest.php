<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Integration;

use OCA\ThreeDViewer\Db\ModelStat;
use OCA\ThreeDViewer\Db\ModelStatMapper;
use OCA\ThreeDViewer\Listener\ModelStatsInvalidationListener;
use OCA\ThreeDViewer\Service\ModelStatsService;
use OCA\ThreeDViewer\Service\ModelStatsStoreResult;
use OCP\Files\Events\Node\NodeDeletedEvent;
use OCP\Files\Events\Node\NodeWrittenEvent;
use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\IUserManager;
use OCP\Server;
use PHPUnit\Framework\TestCase;

/**
 * Model statistics against the real database — SQLite, MySQL and Postgres in CI: one row
 * per file, keyed to the ETag it was measured from, replaced by a newer version's and gone
 * with the file.
 */
class ModelStatsStoreTest extends TestCase
{
    private const PASSWORD = 'integration-suite-password-Aa1!';

    /** A file id no filecache row will ever have. */
    private const MISSING_FILE_ID = 2_000_000_002;

    private ModelStatMapper $mapper;

    private ModelStatsService $service;

    private string $uid;

    private File $file;

    protected function setUp(): void
    {
        $this->mapper = Server::get(ModelStatMapper::class);
        $this->service = Server::get(ModelStatsService::class);
        $this->uid = 'tdv-it-' . bin2hex(random_bytes(6));
        Server::get(IUserManager::class)->createUser($this->uid, self::PASSWORD);
        $this->file = Server::get(IRootFolder::class)->getUserFolder($this->uid)->newFile('model.stl', 'solid x');
    }

    protected function tearDown(): void
    {
        $this->mapper->deleteByFile($this->file->getId());
        $this->mapper->deleteByFile(self::MISSING_FILE_ID);
        Server::get(IUserManager::class)->get($this->uid)?->delete();
    }

    /** @return array<string, mixed> */
    private static function stats(int $triangles = 12): array
    {
        return [
            'v' => 1,
            'kind' => 'mesh',
            'size' => [120.5, 45.0, 80.0],
            'unit' => ['mm' => 1, 'changeable' => true],
            'triangles' => $triangles,
            'vertices' => 8,
            'parts' => 1,
            'materials' => 1,
            'textures' => 0,
            'area' => 500.5,
        ];
    }

    public function testAMeasurementReadsBackForItsVersionAndNoOther(): void
    {
        $id = $this->file->getId();

        $this->assertSame(ModelStatsStoreResult::Stored, $this->service->store($id, 'etag-a', self::stats(), $this->uid));

        $this->assertSame(12, $this->service->get($id, 'etag-a')['triangles'] ?? null);
        $this->assertNull($this->service->get($id, 'etag-b'), 'another version never reads back the numbers of this one');
    }

    public function testTheFirstMeasurementOfAVersionIsKept(): void
    {
        $id = $this->file->getId();
        $this->service->store($id, 'etag-a', self::stats(12), $this->uid);

        $this->assertSame(ModelStatsStoreResult::Exists, $this->service->store($id, 'etag-a', self::stats(99), $this->uid));
        $this->assertSame(12, $this->service->get($id, 'etag-a')['triangles'] ?? null);
    }

    public function testANewerVersionReplacesTheRowOfAnEarlierOne(): void
    {
        $id = $this->file->getId();
        $this->service->store($id, 'etag-a', self::stats(12), $this->uid);

        $this->assertSame(ModelStatsStoreResult::Stored, $this->service->store($id, 'etag-b', self::stats(24), $this->uid));

        $this->assertNull($this->service->get($id, 'etag-a'));
        $this->assertSame(24, $this->service->get($id, 'etag-b')['triangles'] ?? null);
        $this->assertSame([$id => 'etag-b'], $this->mapper->findEtags([$id]));
    }

    public function testTheTableHoldsOneRowPerFile(): void
    {
        $id = $this->file->getId();
        $this->service->store($id, 'etag-a', self::stats(), $this->uid);
        $this->service->store($id, 'etag-b', self::stats(), $this->uid);

        $qb = Server::get(\OCP\IDBConnection::class)->getQueryBuilder();
        $qb->select($qb->func()->count('*'))
            ->from('threedviewer_model_stats')
            ->where($qb->expr()->eq('file_id', $qb->createNamedParameter($id)));
        $result = $qb->executeQuery();
        $rows = (int) $result->fetchOne();
        $result->closeCursor();

        $this->assertSame(1, $rows);
    }

    public function testAnInvalidMeasurementLeavesNothingBehind(): void
    {
        $id = $this->file->getId();

        $this->assertSame(ModelStatsStoreResult::Invalid, $this->service->store($id, 'etag-a', ['v' => 1, 'kind' => 'nope'], $this->uid));
        $this->assertNull($this->mapper->findByFile($id));
    }

    public function testMeasuredNamesOnlyTheFilesWhoseCurrentVersionHasNumbers(): void
    {
        $id = $this->file->getId();
        $this->service->store($id, 'etag-a', self::stats(), $this->uid);

        $this->assertSame([$id], $this->service->measured([$id => 'etag-a']));
        $this->assertSame([], $this->service->measured([$id => 'etag-b']));
        $this->assertSame([], $this->service->measured([self::MISSING_FILE_ID => 'etag-a']));
    }

    /**
     * The listener is handed the events a delete and a write raise. It is called here, not
     * waited for: the server raises a file's events only for the user whose home is the
     * process's default root, which in a CLI suite is the first user it touched.
     * tests/http/ModelStatsHttpTest.php checks that the server does call it, by writing and
     * deleting through WebDAV.
     */
    public function testTheListenerDropsTheNumbersWhenTheFileIsDeleted(): void
    {
        $id = $this->file->getId();
        $this->service->store($id, 'etag-a', self::stats(), $this->uid);

        Server::get(ModelStatsInvalidationListener::class)->handle(new NodeDeletedEvent($this->file));

        $this->assertNull($this->mapper->findByFile($id));
    }

    public function testTheListenerDropsTheNumbersWhenTheFileIsWritten(): void
    {
        $id = $this->file->getId();
        $this->service->store($id, 'etag-a', self::stats(), $this->uid);

        Server::get(ModelStatsInvalidationListener::class)->handle(new NodeWrittenEvent($this->file));

        $this->assertNull($this->mapper->findByFile($id));
    }

    public function testTheListenerLeavesAnotherFilesNumbersAlone(): void
    {
        $other = Server::get(IRootFolder::class)->getUserFolder($this->uid)->newFile('other.stl', 'solid y');
        $this->service->store($other->getId(), 'etag-a', self::stats(), $this->uid);

        Server::get(ModelStatsInvalidationListener::class)->handle(new NodeWrittenEvent($this->file));

        $this->assertNotNull($this->mapper->findByFile($other->getId()));
        $this->mapper->deleteByFile($other->getId());
    }

    public function testTheListenerIgnoresAFileThatIsNotAModel(): void
    {
        $text = Server::get(IRootFolder::class)->getUserFolder($this->uid)->newFile('notes.txt', 'hello');
        $this->mapper->insert($this->row($text->getId()));

        Server::get(ModelStatsInvalidationListener::class)->handle(new NodeDeletedEvent($text));

        $this->assertNotNull($this->mapper->findByFile($text->getId()), 'only model files have numbers to drop');
        $this->mapper->deleteByFile($text->getId());
    }

    private function row(int $fileId): ModelStat
    {
        $row = new ModelStat();
        $row->setFileId($fileId);
        $row->setEtag('etag-a');
        $row->setStats('{}');
        $row->setCreatedBy($this->uid);
        $row->setCreatedAt(time());

        return $row;
    }

    public function testDeleteOrphansRemovesTheNumbersOfFilesThatAreGone(): void
    {
        $id = $this->file->getId();
        $this->service->store($id, 'etag-a', self::stats(), $this->uid);
        $this->service->store(self::MISSING_FILE_ID, 'etag-a', self::stats(), $this->uid);

        $deleted = $this->mapper->deleteOrphans();

        $this->assertGreaterThanOrEqual(1, $deleted);
        $this->assertNull($this->mapper->findByFile(self::MISSING_FILE_ID));
        $this->assertNotNull($this->mapper->findByFile($id), 'a file that exists keeps its numbers');
    }
}
