<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Creates the model statistics table: at most one row per model, holding the numbers the
 * Files sidebar's "3D" tab shows for one version of the file. The row names the ETag it
 * was measured from, so the numbers of an older version are never shown for a newer one,
 * and it is keyed by file id so it follows the model through moves and renames.
 *
 * @psalm-suppress UnusedClass Discovered by the migration runner at runtime.
 */
class Version031400Date20261125000001 extends SimpleMigrationStep
{
    /**
     * @param Closure $schemaClosure The `\Closure` returns a `ISchemaWrapper`
     * @return null|ISchemaWrapper
     */
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options)
    {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if ($schema->hasTable('threedviewer_model_stats')) {
            return $schema;
        }

        $table = $schema->createTable('threedviewer_model_stats');
        $table->addColumn('id', Types::BIGINT, ['autoincrement' => true, 'notnull' => true]);
        $table->addColumn('file_id', Types::BIGINT, ['notnull' => true]);
        $table->addColumn('etag', Types::STRING, ['notnull' => true, 'length' => 128]);
        $table->addColumn('stats', Types::TEXT, ['notnull' => true]);
        $table->addColumn('created_by', Types::STRING, ['notnull' => true, 'length' => 64]);
        $table->addColumn('created_at', Types::BIGINT, ['notnull' => true]);
        // Named: Nextcloud 31 and 32 refuse the default name on a table name this long
        $table->setPrimaryKey(['id'], 'tdv_mstat_pk');
        $table->addUniqueIndex(['file_id'], 'tdv_mstat_file');

        return $schema;
    }
}
