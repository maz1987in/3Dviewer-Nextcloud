<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Migration;

use OCA\ThreeDViewer\Migration\Version031400Date20261125000000;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

/**
 * The migration that gives notes a state and a thread of replies.
 */
class Version031400Date20261125000000Test extends TestCase
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
            ->addMethods(['addColumn', 'hasColumn', 'setPrimaryKey', 'addIndex'])
            ->getMock();
    }

    private function column(): ?MockObject
    {
        return interface_exists(self::ICOLUMN) ? $this->createMock(self::ICOLUMN) : null;
    }

    private function migrate(ISchemaWrapper $schema): mixed
    {
        return (new Version031400Date20261125000000())->changeSchema($this->createMock(IOutput::class), fn () => $schema, []);
    }

    /**
     * @param array<string, array{type: string, spec: array<string, mixed>}> $columns recorded as they are added
     * @param array<string, list<string>> $indexes recorded by name
     */
    private function recording(MockObject $table, array &$columns, array &$indexes, ?string &$primary = null): void
    {
        $column = $this->column();
        $table->method('addColumn')->willReturnCallback(function (string $name, string $type, array $spec = []) use (&$columns, $column) {
            $columns[$name] = ['type' => $type, 'spec' => $spec];

            return $column;
        });
        $table->method('setPrimaryKey')->willReturnCallback(function (array $cols, ?string $name = null) use (&$primary, $table) {
            $primary = $name;

            return $table;
        });
        $table->method('addIndex')->willReturnCallback(function (array $cols, string $name) use (&$indexes, $table) {
            $indexes[$name] = $cols;

            return $table;
        });
    }

    public function testAddsTheStateColumnsToTheNotesAndCreatesTheRepliesTable(): void
    {
        $noteColumns = [];
        $noteIndexes = [];
        $notes = $this->table();
        $notes->method('hasColumn')->willReturn(false);
        $this->recording($notes, $noteColumns, $noteIndexes);

        $replyColumns = [];
        $replyIndexes = [];
        $primary = null;
        $replies = $this->table();
        $this->recording($replies, $replyColumns, $replyIndexes, $primary);

        $schema = $this->createMock(ISchemaWrapper::class);
        $schema->method('hasTable')->willReturnMap([['threedviewer_notes', true], ['threedviewer_note_replies', false]]);
        $schema->method('getTable')->with('threedviewer_notes')->willReturn($notes);
        $schema->expects($this->once())->method('createTable')->with('threedviewer_note_replies')->willReturn($replies);

        $this->assertSame($schema, $this->migrate($schema));

        // Every existing note reads as open without being touched: NOT NULL with a default
        $this->assertSame(['type' => Types::STRING, 'spec' => ['notnull' => true, 'length' => 16, 'default' => 'open']], $noteColumns['state']);
        $this->assertSame(['type' => Types::STRING, 'spec' => ['notnull' => false, 'length' => 64]], $noteColumns['resolved_by']);
        $this->assertSame(['type' => Types::BIGINT, 'spec' => ['notnull' => false]], $noteColumns['resolved_at']);

        $this->assertSame(['id', 'note_id', 'file_id', 'text', 'author_uid', 'created_at', 'updated_at'], array_keys($replyColumns));
        $this->assertSame(Types::TEXT, $replyColumns['text']['type']);
        $this->assertSame(64, $replyColumns['author_uid']['spec']['length']);
        $this->assertSame('tdv_nrep_pk', $primary, 'named: NC 31 and 32 refuse the default name on a table name this long');
        // The thread is read by note and a model's discussion by file
        $this->assertSame(['tdv_nrep_note' => ['note_id'], 'tdv_nrep_file' => ['file_id']], $replyIndexes);
    }

    public function testRunsTwiceWithoutChange(): void
    {
        $notes = $this->table();
        $notes->method('hasColumn')->willReturn(true);
        $notes->expects($this->never())->method('addColumn');
        $schema = $this->createMock(ISchemaWrapper::class);
        $schema->method('hasTable')->willReturn(true);
        $schema->method('getTable')->willReturn($notes);
        $schema->expects($this->never())->method('createTable');

        $this->assertNull($this->migrate($schema));
    }

    public function testAddsOnlyTheColumnsAPartialRunLeftOut(): void
    {
        $notes = $this->table();
        $notes->method('hasColumn')->willReturnCallback(fn (string $name) => $name === 'state');
        $added = [];
        $column = $this->column();
        $notes->method('addColumn')->willReturnCallback(function (string $name) use (&$added, $column) {
            $added[] = $name;

            return $column;
        });
        $schema = $this->createMock(ISchemaWrapper::class);
        $schema->method('hasTable')->willReturnMap([['threedviewer_notes', true], ['threedviewer_note_replies', true]]);
        $schema->method('getTable')->willReturn($notes);

        $this->assertSame($schema, $this->migrate($schema));
        $this->assertSame(['resolved_by', 'resolved_at'], $added);
    }
}
