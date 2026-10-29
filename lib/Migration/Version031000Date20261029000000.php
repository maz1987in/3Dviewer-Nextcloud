<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Creates the per-file settings table: at most one row per model, keyed by its file id so
 * the settings follow the model through moves and renames. For now it holds the unit a
 * file that records none was drawn in; other per-file settings get their own columns.
 *
 * @psalm-suppress UnusedClass Discovered by the migration runner at runtime.
 */
class Version031000Date20261029000000 extends SimpleMigrationStep
{
    /**
     * @param Closure $schemaClosure The `\Closure` returns a `ISchemaWrapper`
     * @return null|ISchemaWrapper
     */
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options)
    {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if ($schema->hasTable('threedviewer_file_settings')) {
            return $schema;
        }

        $table = $schema->createTable('threedviewer_file_settings');
        $table->addColumn('id', Types::BIGINT, ['autoincrement' => true, 'notnull' => true]);
        $table->addColumn('file_id', Types::BIGINT, ['notnull' => true]);
        $table->addColumn('unit', Types::STRING, ['notnull' => false, 'length' => 8]);
        $table->addColumn('updated_by', Types::STRING, ['notnull' => true, 'length' => 64]);
        $table->addColumn('updated_at', Types::BIGINT, ['notnull' => true]);
        $table->setPrimaryKey(['id']);
        $table->addUniqueIndex(['file_id'], 'tdv_fset_file');

        return $schema;
    }
}
