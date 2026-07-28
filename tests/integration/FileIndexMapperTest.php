<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Integration;

use OCA\ThreeDViewer\Db\FileIndex;
use OCA\ThreeDViewer\Db\FileIndexMapper;
use OCP\Server;
use PHPUnit\Framework\TestCase;

/**
 * The file browser's folder listing against the real database.
 *
 * Two defects here reached production and neither was reachable from the unit suite.
 * `getFolders()` built child names with `str_replace()`, which strips every occurrence
 * of the prefix rather than the leading one — with no parent the prefix was a bare `/`,
 * so `models/textures` was listed as `modelstextures`, a folder nobody has. And the
 * query called `escapeLikeParameter()` on the query builder, where the interface does
 * not declare it; a mocked builder answers regardless.
 *
 * Both need real rows and a real connection to show up, which is what this does. Each
 * test owns a unique user id, so the suite neither sees nor disturbs other rows.
 */
class FileIndexMapperTest extends TestCase
{
    private FileIndexMapper $mapper;

    private string $userId;

    protected function setUp(): void
    {
        $this->mapper = Server::get(FileIndexMapper::class);
        $this->userId = 'tdv-it-' . bin2hex(random_bytes(6));
    }

    protected function tearDown(): void
    {
        $this->mapper->deleteByUser($this->userId);
    }

    public function testListsTopLevelFoldersWithoutManglingNestedNames(): void
    {
        // The regression: with no parent, the prefix was "/" and str_replace removed
        // every separator, reporting "modelstextures".
        $this->index('models/textures', 'wood.obj');
        $this->index('models', 'chair.obj');
        $this->index('scans', 'head.stl');

        $folders = $this->mapper->getFolders($this->userId);

        $this->assertSame(['models', 'scans'], $folders);
        $this->assertNotContains('modelstextures', $folders);
    }

    public function testListsImmediateChildrenOfAParent(): void
    {
        $this->index('models/textures', 'wood.png');
        $this->index('models/meshes', 'chair.obj');
        $this->index('models/meshes/deep', 'nested.obj');
        $this->index('elsewhere', 'other.obj');

        $folders = $this->mapper->getFolders($this->userId, 'models');

        $this->assertSame(['models/meshes', 'models/textures'], $folders);
    }

    /**
     * The prefix must come off once, at the front.
     */
    public function testHandlesAChildRepeatingItsParentsName(): void
    {
        $this->index('models/models/v2', 'chair.obj');

        $folders = $this->mapper->getFolders($this->userId, 'models');

        $this->assertSame(['models/models'], $folders);
    }

    /**
     * `escapeLikeParameter` exists so that a folder named with a LIKE wildcard cannot
     * widen the query. Against a real connection an unescaped `_` matches any character,
     * so the sibling below would be listed too.
     */
    public function testAFolderNameContainingALikeWildcardMatchesOnlyItself(): void
    {
        $this->index('a_b/child', 'one.obj');
        $this->index('axb/child', 'two.obj');

        $folders = $this->mapper->getFolders($this->userId, 'a_b');

        $this->assertSame(['a_b/child'], $folders);
    }

    public function testFindsFilesByFolderThroughTheHashedPath(): void
    {
        $this->index('models', 'chair.obj');
        $this->index('models', 'table.obj');
        $this->index('scans', 'head.stl');

        $names = array_map(
            static fn (FileIndex $row): string => $row->getName(),
            $this->mapper->getFilesByFolder($this->userId, 'models'),
        );
        sort($names);

        $this->assertSame(['chair.obj', 'table.obj'], $names);
    }

    public function testSeparatesOneUsersRowsFromAnothers(): void
    {
        $this->index('models', 'chair.obj');

        $other = 'tdv-it-' . bin2hex(random_bytes(6));

        try {
            $this->index('secrets', 'private.obj', $other);

            $this->assertSame(['models'], $this->mapper->getFolders($this->userId));
            $this->assertSame(['secrets'], $this->mapper->getFolders($other));
        } finally {
            $this->mapper->deleteByUser($other);
        }
    }

    private function index(string $folderPath, string $name, ?string $userId = null): void
    {
        $userId ??= $this->userId;

        $row = new FileIndex();
        $row->setFileId(random_int(1_000_000, 9_999_999));
        $row->setUserId($userId);
        $row->setName($name);
        $row->setPath($folderPath === '' ? $name : $folderPath . '/' . $name);
        $row->setFolderPath($folderPath);
        // The digest is computed identically by the migration backfill, by
        // FileIndexService on write and by the mapper on read; drift there returns
        // empty listings rather than an error.
        $row->setFolderPathHash(hash('sha256', $folderPath));
        $row->setExtension(pathinfo($name, PATHINFO_EXTENSION));
        $row->setMtime(1_700_000_000);
        $row->setSize(1024);
        $row->setYear(2023);
        $row->setMonth(11);
        $row->setIndexedAt(1_700_000_000);

        $this->mapper->insert($row);
    }
}
