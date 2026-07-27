<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Migration;

use OCA\ThreeDViewer\Db\FileIndex;
use OCA\ThreeDViewer\Migration\Version010902Date20251116061241;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

/**
 * The migration that creates tv_file_index.
 */
class Version010902Date20251116061241Test extends TestCase
{
    /**
     * Records every column and index the migration declares on a new table.
     *
     * @return array{columns: array<string, array{type: string, spec: array}>, indexes: array<string, array<int, string>>, primary: array<int, string>}
     */
    private function createdTable(): array
    {
        $recorded = ['columns' => [], 'indexes' => [], 'primary' => []];

        $table = $this->getMockBuilder(\stdClass::class)
            ->addMethods(['addColumn', 'setPrimaryKey', 'addUniqueIndex', 'addIndex'])
            ->getMock();

        $table->method('addColumn')->willReturnCallback(
            function (string $name, string $type, array $spec = []) use (&$recorded) {
                $recorded['columns'][$name] = ['type' => $type, 'spec' => $spec];
            }
        );
        $table->method('setPrimaryKey')->willReturnCallback(
            function (array $columns) use (&$recorded) {
                $recorded['primary'] = $columns;
            }
        );
        $table->method('addUniqueIndex')->willReturnCallback(
            function (array $columns, string $name) use (&$recorded) {
                $recorded['indexes'][$name] = $columns;
            }
        );
        $table->method('addIndex')->willReturnCallback(
            function (array $columns, string $name) use (&$recorded) {
                $recorded['indexes'][$name] = $columns;
            }
        );

        $schema = $this->createMock(ISchemaWrapper::class);
        $schema->method('hasTable')->with('tv_file_index')->willReturn(false);
        $schema->method('createTable')->with('tv_file_index')->willReturn($table);

        (new Version010902Date20251116061241())->changeSchema(
            $this->createMock(IOutput::class),
            static fn () => $schema,
            []
        );

        return $recorded;
    }

    public function testCreatesTheTableWithAnAutoIncrementPrimaryKey(): void
    {
        $created = $this->createdTable();

        $this->assertSame(['id'], $created['primary']);
        $this->assertTrue($created['columns']['id']['spec']['autoincrement']);
    }

    public function testEveryFieldTheEntityMapsHasAColumn(): void
    {
        // FileIndexMapper writes whatever FileIndex declares. A field with no
        // column produces an insert that fails at runtime, not at deploy time,
        // so the two must be kept in step. `id` is inherited from Entity and
        // added by the migration separately from the mapped fields.
        $entityFields = [];
        foreach ((new ReflectionClass(FileIndex::class))->getProperties() as $property) {
            if ($property->getDeclaringClass()->getName() === FileIndex::class) {
                $entityFields[] = $this->toColumnName($property->getName());
            }
        }

        $columns = array_keys($this->createdTable()['columns']);
        // folder_path_hash arrives in 010903; every other field must exist here.
        $columns[] = 'folder_path_hash';

        $missing = array_diff($entityFields, $columns);
        $this->assertSame([], array_values($missing), 'FileIndex fields with no column: ' . implode(', ', $missing));
    }

    public function testIndexesTheColumnsTheMapperQueriesOn(): void
    {
        $indexes = $this->createdTable()['indexes'];

        // One row per file per user — the mapper relies on this for upserts.
        $this->assertSame(['file_id', 'user_id'], $indexes['tv_fu']);
        $this->assertSame(['user_id'], $indexes['tv_u']);
        $this->assertSame(['user_id', 'extension'], $indexes['tv_ue']);
        $this->assertSame(['user_id', 'year', 'month'], $indexes['tv_ud']);
        // Version010903 drops tv_uf and repoints it at folder_path_hash; it can
        // only do that if this migration created it under that name.
        $this->assertSame(['user_id', 'folder_path'], $indexes['tv_uf']);
    }

    public function testLeavesAnExistingTableAlone(): void
    {
        $schema = $this->createMock(ISchemaWrapper::class);
        $schema->method('hasTable')->with('tv_file_index')->willReturn(true);
        // Re-running against an installed instance must not try to recreate it.
        $schema->expects($this->never())->method('createTable');

        $returned = (new Version010902Date20251116061241())->changeSchema(
            $this->createMock(IOutput::class),
            static fn () => $schema,
            []
        );

        $this->assertSame($schema, $returned);
    }

    public function testTellsTheAdministratorHowToPopulateTheIndex(): void
    {
        // The table ships empty on purpose — indexing needs services the
        // migration context cannot inject — so the occ command has to be
        // surfaced or existing files stay invisible to the file index.
        $output = $this->createMock(IOutput::class);
        $output->expects($this->once())->method('info')
            ->with($this->stringContains('threedviewer:index-files'));

        (new Version010902Date20251116061241())->postSchemaChange($output, static fn () => null, []);
    }

    private function toColumnName(string $property): string
    {
        return strtolower(preg_replace('/([a-z])([A-Z])/', '$1_$2', $property));
    }
}
