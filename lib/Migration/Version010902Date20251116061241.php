<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version010902Date20251116061241 extends SimpleMigrationStep
{
    /**
     * @param IOutput $output
     * @param Closure $schemaClosure The `\Closure` returns a `ISchemaWrapper`
     * @param array $options
     */
    public function preSchemaChange(IOutput $output, Closure $schemaClosure, array $options)
    {
    }

    /**
     * @param IOutput $output
     * @param Closure $schemaClosure The `\Closure` returns a `ISchemaWrapper`
     * @param array $options
     * @return null|ISchemaWrapper
     */
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options)
    {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if (!$schema->hasTable('tv_file_index')) {
            $table = $schema->createTable('tv_file_index');
            $table->addColumn('id', Types::BIGINT, [
                'autoincrement' => true,
                'notnull' => true,
            ]);
            $table->addColumn('file_id', Types::BIGINT, [
                'notnull' => true,
            ]);
            $table->addColumn('user_id', Types::STRING, [
                'notnull' => true,
                'length' => 64,
            ]);
            $table->addColumn('name', Types::STRING, [
                'notnull' => true,
                'length' => 300,
            ]);
            $table->addColumn('path', Types::TEXT, [
                'notnull' => true,
            ]);
            $table->addColumn('folder_path', Types::STRING, [
                'notnull' => true,
                'length' => 512,
            ]);
            $table->addColumn('extension', Types::STRING, [
                'notnull' => true,
                'length' => 10,
            ]);
            $table->addColumn('mtime', Types::INTEGER, [
                'notnull' => true,
            ]);
            $table->addColumn('size', Types::BIGINT, [
                'notnull' => true,
            ]);
            $table->addColumn('year', Types::INTEGER, [
                'notnull' => true,
            ]);
            $table->addColumn('month', Types::INTEGER, [
                'notnull' => true,
            ]);
            $table->addColumn('indexed_at', Types::INTEGER, [
                'notnull' => true,
            ]);
            $table->setPrimaryKey(['id']);
            $table->addUniqueIndex(['file_id', 'user_id'], 'tv_fu');
            $table->addIndex(['user_id'], 'tv_u');
            $table->addIndex(['user_id', 'folder_path'], 'tv_uf');
            $table->addIndex(['user_id', 'extension'], 'tv_ue');
            $table->addIndex(['user_id', 'year', 'month'], 'tv_ud');
        }

        return $schema;
    }

    /**
     * @param IOutput $output
     * @param Closure $schemaClosure The `\Closure` returns a `ISchemaWrapper`
     * @param array $options
     */
    public function postSchemaChange(IOutput $output, Closure $schemaClosure, array $options)
    {
        // Note: File indexing should be done manually after migration using:
        // php occ threedviewer:index-files [user]
        // This avoids dependency injection issues in migration context
        $output->info('File index table created. Run "php occ threedviewer:index-files" to index existing files.');
    }
}
