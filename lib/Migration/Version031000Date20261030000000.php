<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Adds which way is up to the per-file settings: one of FileSettingsService::UPS for a
 * scan or splat turned for viewing, or null for its format's default.
 *
 * @psalm-suppress UnusedClass Discovered by the migration runner at runtime.
 */
class Version031000Date20261030000000 extends SimpleMigrationStep
{
    /**
     * @param Closure $schemaClosure The `\Closure` returns a `ISchemaWrapper`
     * @return null|ISchemaWrapper
     */
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options)
    {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if (!$schema->hasTable('threedviewer_file_settings')) {
            return null;
        }
        $table = $schema->getTable('threedviewer_file_settings');
        if ($table->hasColumn('up')) {
            return null;
        }
        $table->addColumn('up', Types::STRING, ['notnull' => false, 'length' => 3]);

        return $schema;
    }
}
