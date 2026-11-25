<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Note review: every note gets a state (open until someone resolves it, with who and
 * when), and a note can carry a thread of replies.
 *
 * The state is three columns on the notes table. `state` is NOT NULL with a default, so
 * every note that exists before the migration reads as open without a row being touched;
 * `resolved_by` and `resolved_at` stay empty until a note is resolved.
 *
 * A reply is a row of a table of its own rather than a note with a parent, so the notes
 * every query and every older client already works with — the list, the per-model limit,
 * the people who have written on a model — stay exactly what they were. The table is keyed
 * to its note, and indexed on it because the thread is read by note; the file id is kept
 * beside it so a model's whole discussion is one read.
 *
 * @psalm-suppress UnusedClass Discovered by the migration runner at runtime.
 */
class Version031400Date20261125000000 extends SimpleMigrationStep
{
    /**
     * @param Closure $schemaClosure The `\Closure` returns a `ISchemaWrapper`
     * @return null|ISchemaWrapper
     */
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options)
    {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();
        $changed = false;

        if ($schema->hasTable('threedviewer_notes')) {
            $notes = $schema->getTable('threedviewer_notes');
            if (!$notes->hasColumn('state')) {
                $notes->addColumn('state', Types::STRING, ['notnull' => true, 'length' => 16, 'default' => 'open']);
                $changed = true;
            }
            if (!$notes->hasColumn('resolved_by')) {
                $notes->addColumn('resolved_by', Types::STRING, ['notnull' => false, 'length' => 64]);
                $changed = true;
            }
            if (!$notes->hasColumn('resolved_at')) {
                $notes->addColumn('resolved_at', Types::BIGINT, ['notnull' => false]);
                $changed = true;
            }
        }

        if (!$schema->hasTable('threedviewer_note_replies')) {
            $table = $schema->createTable('threedviewer_note_replies');
            $table->addColumn('id', Types::BIGINT, ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('note_id', Types::BIGINT, ['notnull' => true]);
            $table->addColumn('file_id', Types::BIGINT, ['notnull' => true]);
            $table->addColumn('text', Types::TEXT, ['notnull' => true]);
            $table->addColumn('author_uid', Types::STRING, ['notnull' => true, 'length' => 64]);
            $table->addColumn('created_at', Types::BIGINT, ['notnull' => true]);
            $table->addColumn('updated_at', Types::BIGINT, ['notnull' => true]);
            // Named: Nextcloud 31 and 32 refuse the default name on a table name this long
            $table->setPrimaryKey(['id'], 'tdv_nrep_pk');
            $table->addIndex(['note_id'], 'tdv_nrep_note');
            $table->addIndex(['file_id'], 'tdv_nrep_file');
            $changed = true;
        }

        return $changed ? $schema : null;
    }
}
