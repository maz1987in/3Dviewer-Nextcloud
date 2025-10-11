<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Repair;

require \OC::$SERVERROOT . "/3rdparty/autoload.php";

use OCP\Files\IMimeTypeLoader;
use OCP\Migration\IRepairStep;
use OCP\Migration\IOutput;
use OC\Core\Command\Maintenance\Mimetype\UpdateJS;
use Symfony\Component\Console\Input\StringInput;
use Symfony\Component\Console\Output\ConsoleOutput;

/**
 * Comprehensive repair step to register MIME types for 3D model viewer.
 * 
 * This repair step:
 * 1. Registers MIME types in Nextcloud's database
 * 2. Creates/updates config/mimetypemapping.json file
 * 3. Creates/updates config/mimetypealiases.json file for icons
 * 4. Updates the MIME type JavaScript mappings
 * 
 * Runs automatically on:
 * - App installation (php occ app:enable threedviewer)
 * - App upgrade
 * - Manual repair (php occ maintenance:repair)
 * 
 * @psalm-suppress UnusedClass Registered via Application::registerRepairStep at runtime
 */
class RegisterThreeDMimeTypes implements IRepairStep {
	private const CUSTOM_MIMETYPEMAPPING = 'mimetypemapping.json';
	private const CUSTOM_MIMETYPEALIASES = 'mimetypealiases.json';
	
	/**
	 * Extension to MIME type mappings for 3D model formats
	 * 
	 * SYNC NOTE: The complete list of supported formats is defined in 
	 *            src/config/viewer-config.js (SUPPORTED_FORMATS) as the single source of truth.
	 *            This PHP constant registers MIME types for Nextcloud's file system.
	 * 
	 * MUST stay synchronized with:
	 *  - src/config/viewer-config.js::SUPPORTED_FORMATS
	 *  - lib/Service/ModelFileSupport.php::$supported
	 * 
	 * @see https://www.iana.org/assignments/media-types/media-types.xhtml
	 */
	private const EXT_MIME_MAP = [
		// Critical formats - must be registered for viewer to work
		'glb' => ['model/gltf-binary'],
		'gltf' => ['model/gltf+json'],
		'obj' => ['model/obj'],
		'stl' => ['model/stl'],
		'ply' => ['model/ply'],
		
		// Additional supported formats
		'dae' => ['model/vnd.collada+xml'],
		'3mf' => ['model/3mf'],
		'fbx' => ['model/x.fbx'],
		'3ds' => ['application/x-3ds'],
		'x3d' => ['model/x3d+xml'],
		'vrml' => ['model/vrml'],
		'wrl' => ['model/vrml'], // VRML alternative extension
		
		// Material/texture files
		'mtl' => ['text/plain'],
	];
	
	/** @var IMimeTypeLoader */
	private $mimeTypeLoader;
	
	/** @var UpdateJS */
	private $updateJS;

	public function __construct(IMimeTypeLoader $mimeTypeLoader, UpdateJS $updateJS) {
		$this->mimeTypeLoader = $mimeTypeLoader;
		$this->updateJS = $updateJS;
	}

	public function getName(): string {
		return 'Register 3D model MIME types and create config files (threedviewer)';
	}

	public function run(IOutput $output): void {
		$output->info('Installing 3D model MIME types...');
		
		// Step 1: Register MIME types in database and update file cache
		$this->registerInFileCache($output);
		
		// Step 2: Create/update config files
		$this->updateConfigFiles($output);
		
		$output->info('...done. MIME types registered successfully.');
		$output->info('NOTE: Existing files may need to be rescanned with: php occ files:scan --all');
	}
	
	/**
	 * Register MIME types in Nextcloud's database and update file cache
	 */
	private function registerInFileCache(IOutput $output): void {
		foreach (self::EXT_MIME_MAP as $ext => $mimes) {
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
	 * Create or update config/mimetypemapping.json and config/mimetypealiases.json
	 */
	private function updateConfigFiles(IOutput $output): void {
		$configDir = \OC::$configDir;
		$mimetypemappingFile = $configDir . self::CUSTOM_MIMETYPEMAPPING;
		$mimetypealiasesFile = $configDir . self::CUSTOM_MIMETYPEALIASES;
		
		// Update mimetypemapping.json (extension => [mime types])
		$this->appendToFileMapping($mimetypemappingFile, self::EXT_MIME_MAP);
		$output->info("  ✓ Updated: $mimetypemappingFile");
		
		// Update mimetypealiases.json (mime type => extension for icons)
		$this->appendToFileAliases($mimetypealiasesFile, self::EXT_MIME_MAP);
		$output->info("  ✓ Updated: $mimetypealiasesFile");
		
		// Regenerate JavaScript MIME type mappings
		try {
			$this->updateJS->run(new StringInput(''), new ConsoleOutput());
			$output->info("  ✓ Regenerated JavaScript MIME type mappings");
		} catch (\Throwable $e) {
			$output->warning("  ✗ Failed to regenerate JS mappings: {$e->getMessage()}");
		}
	}
	
	/**
	 * Append entries to mimetypemapping.json (extension => [mime types])
	 */
	private function appendToFileMapping(string $filename, array $data): void {
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
	
	/**
	 * Append entries to mimetypealiases.json (mime type => extension for icons)
	 */
	private function appendToFileAliases(string $filename, array $data): void {
		$obj = [];
		
		// Load existing file if it exists
		if (file_exists($filename)) {
			$content = file_get_contents($filename);
			$obj = json_decode($content, true);
			if (json_last_error() !== JSON_ERROR_NONE) {
				$obj = [];
			}
		}
		
		// Add aliases: mime type => extension (for icon lookup)
		foreach ($data as $ext => $mimes) {
			foreach ($mimes as $mime) {
				$obj[$mime] = $ext;
			}
		}
		
		// Write back with pretty formatting
		$mask = empty($obj) 
			? JSON_FORCE_OBJECT | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES 
			: JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES;
		file_put_contents($filename, json_encode($obj, $mask));
	}
}
