<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Migration;

use OCA\ThreeDViewer\Migration\Version030600Date20260928000000;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

/**
 * The migration that creates the shared notes table.
 */
class Version030600Date20260928000000Test extends TestCase
{
    /** Named as strings: both interfaces only exist from NC 35. */
    private const ITABLE = 'OCP\\DB\\Schema\\ITable';
    private const ICOLUMN = 'OCP\\DB\\Schema\\IColumn';

    /**
     * A table double. From NC 35 ISchemaWrapper::createTable() declares ITable as
     * its return type, so the double has to implement it. Before 35 the interface
     * does not exist and createTable() returns Doctrine's Table, so the double only
     * needs the methods the migration calls.
     */
    private function table(): MockObject
    {
        if (interface_exists(self::ITABLE)) {
            return $this->createMock(self::ITABLE);
        }

        return $this->getMockBuilder(\stdClass::class)
            ->addMethods(['addColumn', 'setPrimaryKey', 'addIndex'])
            ->getMock();
    }

    /**
     * What addColumn() hands back: ITable declares IColumn, Doctrine's Table a
     * Column the migration never uses.
     */
    private function column(): ?MockObject
    {
        return interface_exists(self::ICOLUMN) ? $this->createMock(self::ICOLUMN) : null;
    }

    public function testCreatesTheNotesTableWithItsColumnsAndFileIndex(): void
    {
        $recorded = ['columns' => [], 'indexes' => [], 'primary' => []];

        $table = $this->table();
        $column = $this->column();
        $table->method('addColumn')->willReturnCallback(
            function (string $name, string $type, array $spec = []) use (&$recorded, $column) {
                $recorded['columns'][$name] = ['type' => $type, 'spec' => $spec];

                return $column;
            }
        );
        $table->method('setPrimaryKey')->willReturnCallback(
            function (array $columns) use (&$recorded, $table) {
                $recorded['primary'] = $columns;

                return $table;
            }
        );
        $table->method('addIndex')->willReturnCallback(
            function (array $columns, string $name) use (&$recorded, $table) {
                $recorded['indexes'][$name] = $columns;

                return $table;
            }
        );

        $schema = $this->createMock(ISchemaWrapper::class);
        $schema->method('hasTable')->with('threedviewer_notes')->willReturn(false);
        $schema->expects($this->once())->method('createTable')->with('threedviewer_notes')->willReturn($table);

        (new Version030600Date20260928000000())->changeSchema(
            $this->createMock(IOutput::class),
            fn () => $schema,
            []
        );

        $this->assertSame(
            ['id', 'file_id', 'type', 'payload', 'author_uid', 'created_at', 'updated_at'],
            array_keys($recorded['columns'])
        );
        $this->assertSame(Types::BIGINT, $recorded['columns']['file_id']['type']);
        $this->assertSame(Types::TEXT, $recorded['columns']['payload']['type']);
        $this->assertSame(16, $recorded['columns']['type']['spec']['length']);
        $this->assertSame(64, $recorded['columns']['author_uid']['spec']['length']);
        $this->assertSame(['id'], $recorded['primary']);
        $this->assertSame(['file_id'], $recorded['indexes']['tdv_notes_file']);
    }

    public function testLeavesAnExistingTableAlone(): void
    {
        $schema = $this->createMock(ISchemaWrapper::class);
        $schema->method('hasTable')->with('threedviewer_notes')->willReturn(true);
        $schema->expects($this->never())->method('createTable');

        (new Version030600Date20260928000000())->changeSchema(
            $this->createMock(IOutput::class),
            fn () => $schema,
            []
        );
    }
}
