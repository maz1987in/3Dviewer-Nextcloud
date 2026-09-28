<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Creates the shared notes table: one row per annotation or measurement, keyed by the
 * model's file id so a note follows the model through moves and renames.
 */
class Version030600Date20260928000000 extends SimpleMigrationStep
{
    /**
     * @param Closure $schemaClosure The `\Closure` returns a `ISchemaWrapper`
     * @return null|ISchemaWrapper
     */
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options)
    {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if ($schema->hasTable('threedviewer_notes')) {
            return $schema;
        }

        $table = $schema->createTable('threedviewer_notes');
        $table->addColumn('id', Types::BIGINT, ['autoincrement' => true, 'notnull' => true]);
        $table->addColumn('file_id', Types::BIGINT, ['notnull' => true]);
        $table->addColumn('type', Types::STRING, ['notnull' => true, 'length' => 16]);
        $table->addColumn('payload', Types::TEXT, ['notnull' => true]);
        $table->addColumn('author_uid', Types::STRING, ['notnull' => true, 'length' => 64]);
        $table->addColumn('created_at', Types::BIGINT, ['notnull' => true]);
        $table->addColumn('updated_at', Types::BIGINT, ['notnull' => true]);
        $table->setPrimaryKey(['id']);
        $table->addIndex(['file_id'], 'tdv_notes_file');

        return $schema;
    }
}
