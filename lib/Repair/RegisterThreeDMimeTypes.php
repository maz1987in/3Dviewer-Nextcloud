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
 * Comprehensive repair step to register MIME types for 3D model viewer.
 *
 * This repair step:
 * 1. Registers MIME types in Nextcloud's database
 * 2. Creates/updates config/mimetypemapping.json file
 * 3. Updates the MIME type JavaScript mappings
 *
 * Runs automatically on:
 * - App installation (php occ app:enable threedviewer)
 * - App upgrade
 * - Manual repair (php occ maintenance:repair)
 *
 * @psalm-suppress UnusedClass Registered via Application::registerRepairStep at runtime
 */
class RegisterThreeDMimeTypes implements IRepairStep
{
    private const CUSTOM_MIMETYPEMAPPING = 'mimetypemapping.json';

    /** @var IMimeTypeLoader */
    private $mimeTypeLoader;

    /** @var UpdateJS */
    private $updateJS;

    public function __construct(IMimeTypeLoader $mimeTypeLoader, UpdateJS $updateJS)
    {
        $this->mimeTypeLoader = $mimeTypeLoader;
        $this->updateJS = $updateJS;
    }

    public function getName(): string
    {
        return 'Register 3D model MIME types and create config files (threedviewer)';
    }

    public function run(IOutput $output): void
    {
        $output->info('Installing 3D model MIME types...');

        // Step 1: Register MIME types in database and update file cache
        $this->registerInFileCache($output);

        // Step 2: Create/update config files
        $this->updateConfigFiles($output);

        $output->info('...done. MIME types registered successfully.');
        $output->info('NOTE: Existing files may need to be rescanned with: php occ files:scan --all');
    }

    /**
     * Register MIME types in Nextcloud's database and update file cache.
     */
    private function registerInFileCache(IOutput $output): void
    {
        foreach (SupportedFormats::EXT_MIME_MAP as $ext => $mimes) {
            $mimes = is_array($mimes) ? $mimes : [$mimes];

            foreach ($mimes as $mime) {
                try {
                    // Get or create the MIME type ID
                    $mimeTypeId = $this->mimeTypeLoader->getId($mime);

                    // Update file cache for this extension
                    $this->mimeTypeLoader->updateFilecache($ext, $mimeTypeId);

                    $output->info("  ✓ Registered: .$ext => $mime");
                } catch (\Throwable $e) {
                    $output->warning("  ✗ Failed to register: .$ext => $mime ({$e->getMessage()})");
                }
            }
        }
    }

    /**
     * Create or update config/mimetypemapping.json.
     */
    private function updateConfigFiles(IOutput $output): void
    {
        $configDir = \OC::$configDir;
        $mimetypemappingFile = $configDir . self::CUSTOM_MIMETYPEMAPPING;

        // Update mimetypemapping.json (extension => [mime types])
        $this->appendToFileMapping($mimetypemappingFile, SupportedFormats::EXT_MIME_MAP);
        $output->info("  ✓ Updated: $mimetypemappingFile");

        // Regenerate JavaScript MIME type mappings
        try {
            $this->updateJS->run(new StringInput(''), new ConsoleOutput());
            $output->info('  ✓ Regenerated JavaScript MIME type mappings');
        } catch (\Throwable $e) {
            $output->warning("  ✗ Failed to regenerate JS mappings: {$e->getMessage()}");
        }
    }

    /**
     * Append entries to mimetypemapping.json (extension => [mime types]).
     */
    private function appendToFileMapping(string $filename, array $data): void
    {
        $obj = [];

        // Load existing file if it exists
        if (file_exists($filename)) {
            $content = file_get_contents($filename);
            $obj = json_decode($content, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                $obj = [];
            }
        }

        // Add new mappings (overwrites if extension already exists)
        foreach ($data as $ext => $mimes) {
            $obj[$ext] = $mimes;
        }

        // Write back with pretty formatting
        $mask = empty($obj)
            ? JSON_FORCE_OBJECT | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
            : JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES;
        file_put_contents($filename, json_encode($obj, $mask));
    }

}
