<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Migration;

use OCA\ThreeDViewer\Migration\Version030600Date20260928000000;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use PHPUnit\Framework\TestCase;

/**
 * The migration that creates the shared notes table.
 */
class Version030600Date20260928000000Test extends TestCase
{
    public function testCreatesTheNotesTableWithItsColumnsAndFileIndex(): void
    {
        $recorded = ['columns' => [], 'indexes' => [], 'primary' => []];

        $table = $this->getMockBuilder(\stdClass::class)
            ->addMethods(['addColumn', 'setPrimaryKey', 'addIndex'])
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
        $table->method('addIndex')->willReturnCallback(
            function (array $columns, string $name) use (&$recorded) {
                $recorded['indexes'][$name] = $columns;
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
