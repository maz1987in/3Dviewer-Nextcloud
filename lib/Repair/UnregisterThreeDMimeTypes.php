<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Repair;

require \OC::$SERVERROOT . '/3rdparty/autoload.php';

use OC\Core\Command\Maintenance\Mimetype\UpdateJS;
use OCA\ThreeDViewer\Constants\SupportedFormats;
use OCP\Files\IMimeTypeLoader;
use OCP\Migration\IOutput;
use OCP\Migration\IRepairStep;
use Symfony\Component\Console\Input\StringInput;
use Symfony\Component\Console\Output\ConsoleOutput;

/**
 * Repair step to unregister MIME types when the 3D viewer app is uninstalled.
 *
 * This repair step:
 * 1. Resets MIME types in Nextcloud's database to application/octet-stream
 * 2. Removes entries from config/mimetypemapping.json file
 * 3. Updates the MIME type JavaScript mappings
 *
 * Runs automatically on:
 * - App uninstallation (php occ app:remove threedviewer)
 *
 * @psalm-suppress UnusedClass Registered via info.xml repair-steps at runtime
 */
class UnregisterThreeDMimeTypes implements IRepairStep
{
    private const CUSTOM_MIMETYPEMAPPING = 'mimetypemapping.json';

    private IMimeTypeLoader $mimeTypeLoader;
    private UpdateJS $updateJS;

    public function __construct(IMimeTypeLoader $mimeTypeLoader, UpdateJS $updateJS)
    {
        $this->mimeTypeLoader = $mimeTypeLoader;
        $this->updateJS = $updateJS;
    }

    /**
     * @inheritDoc
     */
    public function getName(): string
    {
        return 'Unregister 3D model MIME types and clean up config files (threedviewer)';
    }

    /**
     * @inheritDoc
     */
    public function run(IOutput $output): void
    {
        $output->info('Unregistering 3D model MIME types...');

        $this->unregisterInFileCache($output);
        $this->updateConfigFiles($output);

        $output->info('...done. MIME types unregistered successfully.');
        $output->info('NOTE: Files will now download instead of opening in viewer.');
    }

    /**
     * Reset MIME types in database to application/octet-stream (downloadable).
     */
    private function unregisterInFileCache(IOutput $output): void
    {
        // Force back to downloadable type in cache
        $defaultMimeTypeId = $this->mimeTypeLoader->getId('application/octet-stream');

        foreach (array_keys(SupportedFormats::EXT_MIME_MAP) as $ext) {
            $this->mimeTypeLoader->updateFilecache($ext, $defaultMimeTypeId);
            $output->info("  ✓ Reset: .{$ext} => application/octet-stream");
        }
    }

    /**
     * Remove entries from config files and regenerate JavaScript.
     */
    private function updateConfigFiles(IOutput $output): void
    {
        $configDir = \OC::$configDir;
        $mimetypemappingFile = $configDir . self::CUSTOM_MIMETYPEMAPPING;

        // Remove from mimetypemapping.json
        $this->removeFromFileMapping($mimetypemappingFile, SupportedFormats::EXT_MIME_MAP);
        if (file_exists($mimetypemappingFile)) {
            $output->info("  ✓ Updated: {$mimetypemappingFile}");
        }

        // Regenerate JavaScript MIME type mappings
        $this->updateJS->run(new StringInput(''), new ConsoleOutput());
        $output->info('  ✓ Regenerated JavaScript MIME type mappings');
    }

    /**
     * Remove extension entries from mimetypemapping.json.
     *
     * @param string $filename Path to mimetypemapping.json
     * @param array $data Extension to MIME type mappings to remove
     */
    private function removeFromFileMapping(string $filename, array $data): void
    {
        $obj = [];
        if (file_exists($filename)) {
            $content = file_get_contents($filename);
            $obj = json_decode($content, true);
            if (JSON_ERROR_NONE !== json_last_error()) {
                $obj = [];
            }
        }

        // Remove extensions
        foreach ($data as $ext => $mimes) {
            unset($obj[$ext]);
        }

        // Write back (preserve file if other apps have entries)
        $mask = empty($obj) ? JSON_FORCE_OBJECT | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES : JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES;
        file_put_contents($filename, json_encode($obj, $mask));
    }
}
