<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Migration;

use Closure;
use Doctrine\DBAL\Types\Type;
use OC;
use OCP\DB\ISchemaWrapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version010903Date20251121000000 extends SimpleMigrationStep
{
    private $connection;

    public function __construct()
    {
        $this->connection = OC::$server->getDatabaseConnection();
    }

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options)
    {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if (!$schema->hasTable('tv_file_index')) {
            return $schema;
        }

        $table = $schema->getTable('tv_file_index');

        if ($table->hasColumn('folder_path')) {
            $table->changeColumn('folder_path', [
                'type' => Type::getType(Types::TEXT),
                'notnull' => true,
            ]);
        }

        if (!$table->hasColumn('folder_path_hash')) {
            $table->addColumn('folder_path_hash', Types::STRING, [
                'notnull' => false,
                'length' => 64,
            ]);
        }

        if ($table->hasIndex('tv_uf')) {
            $table->dropIndex('tv_uf');
        }
        $table->addIndex(['user_id', 'folder_path_hash'], 'tv_uf');

        return $schema;
    }

    public function postSchemaChange(IOutput $output, Closure $schemaClosure, array $options)
    {
        $select = $this->connection->getQueryBuilder();
        $select->select('id', 'folder_path')
            ->from('tv_file_index');

        $result = $select->executeQuery();
        while ($row = $result->fetch()) {
            $hash = hash('sha256', (string) $row['folder_path']);

            $update = $this->connection->getQueryBuilder();
            $update->update('tv_file_index')
                ->set('folder_path_hash', $update->createNamedParameter($hash, IQueryBuilder::PARAM_STR))
                ->where($update->expr()->eq('id', $update->createNamedParameter((int) $row['id'], IQueryBuilder::PARAM_INT)));
            $update->executeStatement();
        }
        $result->closeCursor();
    }
}
