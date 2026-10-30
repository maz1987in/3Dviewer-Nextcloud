<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Migration;

use OCA\ThreeDViewer\Migration\Version031000Date20261030000000;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

/**
 * The migration that adds which way is up to the per-file settings.
 */
class Version031000Date20261030000000Test extends TestCase
{
    /** Named as strings: both interfaces only exist from NC 35. */
    private const ITABLE = 'OCP\\DB\\Schema\\ITable';
    private const ICOLUMN = 'OCP\\DB\\Schema\\IColumn';

    /** A table double; see Version030600Date20260928000000Test for why it takes two forms. */
    private function table(bool $hasUp): MockObject
    {
        $table = interface_exists(self::ITABLE)
            ? $this->createMock(self::ITABLE)
            : $this->getMockBuilder(\stdClass::class)->addMethods(['addColumn', 'hasColumn'])->getMock();
        $table->method('hasColumn')->with('up')->willReturn($hasUp);

        return $table;
    }

    private function migrate(ISchemaWrapper $schema): mixed
    {
        return (new Version031000Date20261030000000())->changeSchema($this->createMock(IOutput::class), fn () => $schema, []);
    }

    public function testAddsANullableUpColumn(): void
    {
        $table = $this->table(false);
        $column = interface_exists(self::ICOLUMN) ? $this->createMock(self::ICOLUMN) : null;
        $table->expects($this->once())->method('addColumn')
            ->with('up', Types::STRING, ['notnull' => false, 'length' => 3])
            ->willReturn($column);
        $schema = $this->createMock(ISchemaWrapper::class);
        $schema->method('hasTable')->willReturn(true);
        $schema->method('getTable')->with('threedviewer_file_settings')->willReturn($table);

        $this->assertSame($schema, $this->migrate($schema));
    }

    public function testRunsTwiceWithoutChange(): void
    {
        $table = $this->table(true);
        $table->expects($this->never())->method('addColumn');
        $schema = $this->createMock(ISchemaWrapper::class);
        $schema->method('hasTable')->willReturn(true);
        $schema->method('getTable')->willReturn($table);

        $this->assertNull($this->migrate($schema));
    }
}
