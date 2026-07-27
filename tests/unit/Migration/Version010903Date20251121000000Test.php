<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Migration;

use Doctrine\DBAL\Types\Type;
use OCA\ThreeDViewer\Migration\Version010903Date20251121000000;
use OCA\ThreeDViewer\Service\FileIndexService;
use OCP\DB\IResult;
use OCP\DB\ISchemaWrapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;
use OCP\Migration\IOutput;
use PHPUnit\Framework\TestCase;
use ReflectionClass;
use ReflectionMethod;

/**
 * The migration that replaces the folder_path index with a hash of it.
 *
 * The step is built without its constructor: that constructor resolves
 * IDBConnection through OCP\Server, which needs a running server. Whether it
 * uses the *public* locator rather than the private \OC container — the
 * distinction that fataled the NC 34 upgrade — is asserted separately by
 * NoPrivateServerApiTest, which scans for that class by name.
 */
class Version010903Date20251121000000Test extends TestCase
{
    private function migration(?IDBConnection $connection = null): Version010903Date20251121000000
    {
        $reflection = new ReflectionClass(Version010903Date20251121000000::class);
        $migration = $reflection->newInstanceWithoutConstructor();

        $property = $reflection->getProperty('connection');
        $property->setAccessible(true);
        $property->setValue($migration, $connection ?? $this->createMock(IDBConnection::class));

        return $migration;
    }

    public function testLeavesSchemaAloneWhenTheTableIsAbsent(): void
    {
        $schema = $this->createMock(ISchemaWrapper::class);
        $schema->method('hasTable')->with('tv_file_index')->willReturn(false);
        // The guard exists so a fresh install, where 010902 has not run yet,
        // does not fatal on a missing table.
        $schema->expects($this->never())->method('getTable');

        $returned = $this->migration()->changeSchema(
            $this->createMock(IOutput::class),
            static fn () => $schema,
            []
        );

        $this->assertSame($schema, $returned);
    }

    public function testAddsTheHashColumnAndRepointsTheIndex(): void
    {
        $table = $this->getMockBuilder(\stdClass::class)
            ->addMethods(['hasColumn', 'changeColumn', 'addColumn', 'hasIndex', 'dropIndex', 'addIndex'])
            ->getMock();

        $table->method('hasColumn')->willReturnMap([
            ['folder_path', true],
            ['folder_path_hash', false],
        ]);
        $table->method('hasIndex')->with('tv_uf')->willReturn(true);

        // folder_path was STRING(512) in 010902; paths can exceed that.
        $table->expects($this->once())->method('changeColumn')
            ->with('folder_path', $this->callback(static function (array $spec): bool {
                return $spec['notnull'] === true
                    && $spec['type'] instanceof Type;
            }));

        $table->expects($this->once())->method('addColumn')
            ->with('folder_path_hash', 'string', $this->callback(
                // 64 hex characters is exactly one sha256 digest.
                static fn (array $spec): bool => $spec['length'] === 64 && $spec['notnull'] === false
            ));

        // The old index must go before the new one is added: both are named
        // tv_uf, so adding first would collide.
        $table->expects($this->once())->method('dropIndex')->with('tv_uf');
        $table->expects($this->once())->method('addIndex')
            ->with(['user_id', 'folder_path_hash'], 'tv_uf');

        $schema = $this->createMock(ISchemaWrapper::class);
        $schema->method('hasTable')->willReturn(true);
        $schema->method('getTable')->with('tv_file_index')->willReturn($table);

        $this->migration()->changeSchema($this->createMock(IOutput::class), static fn () => $schema, []);
    }

    public function testDoesNotReAddTheHashColumnWhenItAlreadyExists(): void
    {
        $table = $this->getMockBuilder(\stdClass::class)
            ->addMethods(['hasColumn', 'changeColumn', 'addColumn', 'hasIndex', 'dropIndex', 'addIndex'])
            ->getMock();

        $table->method('hasColumn')->willReturnMap([
            ['folder_path', true],
            ['folder_path_hash', true],
        ]);
        $table->method('hasIndex')->willReturn(false);

        // Re-running the migration must not attempt to add a duplicate column.
        $table->expects($this->never())->method('addColumn');
        // Nor drop an index that is not there.
        $table->expects($this->never())->method('dropIndex');

        $schema = $this->createMock(ISchemaWrapper::class);
        $schema->method('hasTable')->willReturn(true);
        $schema->method('getTable')->willReturn($table);

        $this->migration()->changeSchema($this->createMock(IOutput::class), static fn () => $schema, []);
    }

    public function testBackfillsEachRowWithTheHashOfItsFolderPath(): void
    {
        $rows = [
            ['id' => '1', 'folder_path' => '/admin/files/models'],
            ['id' => '7', 'folder_path' => '/admin/files/models/textures'],
        ];

        $written = [];
        $connection = $this->connectionReturning($rows, $written);

        $this->migration($connection)->postSchemaChange($this->createMock(IOutput::class), static fn () => null, []);

        $this->assertSame([
            1 => hash('sha256', '/admin/files/models'),
            7 => hash('sha256', '/admin/files/models/textures'),
        ], $written);
    }

    public function testBackfilledHashMatchesTheOneTheApplicationQueriesWith(): void
    {
        // The digest is computed independently in three places: here, in
        // FileIndexService::hashFolderPath when a row is written, and inline in
        // FileIndexMapper::getFilesByFolder when one is read back. If any of
        // them drifts, the migration backfills values no query will ever match
        // and getFilesByFolder silently returns nothing.
        $path = '/admin/files/models';

        $written = [];
        $this->migration($this->connectionReturning([['id' => '1', 'folder_path' => $path]], $written))
            ->postSchemaChange($this->createMock(IOutput::class), static fn () => null, []);

        $hashFolderPath = new ReflectionMethod(FileIndexService::class, 'hashFolderPath');
        $hashFolderPath->setAccessible(true);
        $serviceHash = $hashFolderPath->invoke(
            (new ReflectionClass(FileIndexService::class))->newInstanceWithoutConstructor(),
            $path
        );

        $this->assertSame($serviceHash, $written[1], 'migration backfill disagrees with FileIndexService');

        $mapperSource = file_get_contents(__DIR__ . '/../../../lib/Db/FileIndexMapper.php');
        $this->assertStringContainsString(
            "hash('sha256', \$folderPath)",
            $mapperSource,
            'FileIndexMapper no longer hashes the folder path the same way'
        );
    }

    public function testClosesTheCursorAfterBackfilling(): void
    {
        $written = [];
        $result = $this->resultReturning([], $written);
        $result->expects($this->once())->method('closeCursor');

        $connection = $this->createMock(IDBConnection::class);
        $select = $this->queryBuilderSelecting($result);
        $connection->method('getQueryBuilder')->willReturn($select);

        $this->migration($connection)->postSchemaChange($this->createMock(IOutput::class), static fn () => null, []);
    }

    /**
     * A connection whose select yields $rows, recording every hash the
     * migration writes into $written keyed by row id.
     *
     * @param array<int, array<string, string>> $rows
     * @param array<int, string> $written
     */
    private function connectionReturning(array $rows, array &$written): IDBConnection
    {
        $result = $this->resultReturning($rows, $written);
        $select = $this->queryBuilderSelecting($result);

        $connection = $this->createMock(IDBConnection::class);
        $connection->method('getQueryBuilder')->willReturnCallback(
            function () use ($select, &$written) {
                static $first = true;
                if ($first) {
                    $first = false;

                    return $select;
                }

                return $this->updateQueryBuilder($written);
            }
        );

        return $connection;
    }

    /**
     * @param array<int, array<string, string>> $rows
     * @param array<int, string> $written
     */
    private function resultReturning(array $rows, array &$written): IResult
    {
        $result = $this->createMock(IResult::class);

        $queue = $rows;
        $result->method('fetch')->willReturnCallback(static function () use (&$queue) {
            return array_shift($queue) ?? false;
        });

        return $result;
    }

    private function queryBuilderSelecting(IResult $result): IQueryBuilder
    {
        $select = $this->createMock(IQueryBuilder::class);
        $select->method('select')->willReturnSelf();
        $select->method('from')->willReturnSelf();
        $select->method('executeQuery')->willReturn($result);

        return $select;
    }

    /**
     * An update builder that records the hash and id it was handed, so the test
     * asserts on what would reach the database rather than on mock call counts.
     *
     * @param array<int, string> $written
     */
    private function updateQueryBuilder(array &$written): IQueryBuilder
    {
        $hash = null;
        $id = null;

        $expr = $this->createMock(\OCP\DB\QueryBuilder\IExpressionBuilder::class);
        $expr->method('eq')->willReturn('id = :id');

        $update = $this->createMock(IQueryBuilder::class);
        $update->method('update')->willReturnSelf();
        $update->method('expr')->willReturn($expr);
        $update->method('createNamedParameter')->willReturnCallback(
            static function ($value, $type = null) use (&$hash, &$id) {
                if (is_int($value)) {
                    $id = $value;
                } else {
                    $hash = $value;
                }

                return ':p';
            }
        );
        $update->method('set')->willReturnSelf();
        $update->method('where')->willReturnSelf();
        $update->method('executeStatement')->willReturnCallback(
            static function () use (&$hash, &$id, &$written) {
                $written[$id] = $hash;

                return 1;
            }
        );

        return $update;
    }
}
