<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Migration;

use OCA\ThreeDViewer\Migration\Version031400Date20261125000001;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

/**
 * The migration that creates the model statistics table.
 */
class Version031400Date20261125000001Test extends TestCase
{
    /** Named as strings: both interfaces only exist from NC 35. */
    private const ITABLE = 'OCP\\DB\\Schema\\ITable';
    private const ICOLUMN = 'OCP\\DB\\Schema\\IColumn';

    /** A table double; see Version030600Date20260928000000Test for why it takes two forms. */
    private function table(): MockObject
    {
        if (interface_exists(self::ITABLE)) {
            return $this->createMock(self::ITABLE);
        }

        return $this->getMockBuilder(\stdClass::class)
            ->addMethods(['addColumn', 'setPrimaryKey', 'addUniqueIndex'])
            ->getMock();
    }

    private function column(): ?MockObject
    {
        return interface_exists(self::ICOLUMN) ? $this->createMock(self::ICOLUMN) : null;
    }

    public function testCreatesTheStatisticsTableWithOneRowPerFile(): void
    {
        $recorded = ['columns' => [], 'unique' => [], 'primary' => []];

        $table = $this->table();
        $column = $this->column();
        $table->method('addColumn')->willReturnCallback(
            function (string $name, string $type, array $spec = []) use (&$recorded, $column) {
                $recorded['columns'][$name] = ['type' => $type, 'spec' => $spec];

                return $column;
            }
        );
        $table->method('setPrimaryKey')->willReturnCallback(
            function (array $columns, $name = false) use (&$recorded, $table) {
                $recorded['primary'] = $columns;
                $recorded['primaryName'] = $name;

                return $table;
            }
        );
        $table->method('addUniqueIndex')->willReturnCallback(
            function (array $columns, string $name) use (&$recorded, $table) {
                $recorded['unique'][$name] = $columns;

                return $table;
            }
        );

        $schema = $this->createMock(ISchemaWrapper::class);
        $schema->method('hasTable')->with('threedviewer_model_stats')->willReturn(false);
        $schema->expects($this->once())->method('createTable')->with('threedviewer_model_stats')->willReturn($table);

        (new Version031400Date20261125000001())->changeSchema(
            $this->createMock(IOutput::class),
            fn () => $schema,
            []
        );

        $this->assertSame(['id', 'file_id', 'etag', 'stats', 'created_by', 'created_at'], array_keys($recorded['columns']));
        $this->assertSame(Types::BIGINT, $recorded['columns']['file_id']['type']);
        $this->assertSame(Types::STRING, $recorded['columns']['etag']['type']);
        $this->assertSame(128, $recorded['columns']['etag']['spec']['length']);
        $this->assertTrue($recorded['columns']['etag']['spec']['notnull']);
        $this->assertSame(Types::TEXT, $recorded['columns']['stats']['type']);
        $this->assertTrue($recorded['columns']['stats']['spec']['notnull']);
        $this->assertSame(64, $recorded['columns']['created_by']['spec']['length']);
        $this->assertSame(['id'], $recorded['primary']);
        // Nextcloud 31 and 32 refuse the default primary key name on a table whose name,
        // without the prefix, is 23 characters or more, and any name past 30
        $this->assertIsString($recorded['primaryName']);
        $this->assertLessThanOrEqual(30, strlen('tdv_mstat_file'));
        $this->assertLessThanOrEqual(30, strlen($recorded['primaryName']));
        $this->assertSame(['file_id'], $recorded['unique']['tdv_mstat_file']);
    }

    public function testLeavesAnExistingTableAlone(): void
    {
        $schema = $this->createMock(ISchemaWrapper::class);
        $schema->method('hasTable')->with('threedviewer_model_stats')->willReturn(true);
        $schema->expects($this->never())->method('createTable');

        (new Version031400Date20261125000001())->changeSchema(
            $this->createMock(IOutput::class),
            fn () => $schema,
            []
        );
    }
}
