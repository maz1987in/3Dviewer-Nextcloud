<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Repair;

use OCP\Files\IMimeTypeDetector;
use OCP\Files\IMimeTypeLoader;
use OCP\Migration\IRepairStep;
use OCP\Migration\IOutput;

/**
 * Lightweight repair step to register missing MIME mappings for supported 3D viewer formats.
 *
 * Only adds mappings if they are absent; never overwrites existing ones to avoid conflicting with
 * core or other apps. This makes it safe to run multiple times (idempotent).
 *
 * @psalm-suppress UnusedClass Registered via Application::registerRepairStep at runtime
 */
class RegisterThreeDMimeTypes implements IRepairStep {
	/** @var IMimeTypeLoader */
	private $mimeTypeLoader;

	/** @var IMimeTypeDetector */
	private $mimeTypeDetector;

	public function __construct(IMimeTypeLoader $mimeTypeLoader, IMimeTypeDetector $mimeTypeDetector) {
		$this->mimeTypeLoader = $mimeTypeLoader;
		$this->mimeTypeDetector = $mimeTypeDetector;
	}

	public function getName(): string {
		return 'Register additional 3D model MIME types (threedviewer)';
	}

	public function run(IOutput $output): void {
		$desired = [
			// ext => mime
			'ply' => 'model/ply',
			'fbx' => 'application/octet-stream', // no official registered specific type commonly used
			'mtl' => 'text/plain', // material library (Wavefront); plain text
		];
		foreach ($desired as $ext => $mime) {
			$shouldAdd = true;
			try {
				$existing = $this->mimeTypeDetector->detectPath("file.$ext");
				// If detector returns something other than generic octet-stream and it's not exactly our target, leave it.
				if ($existing !== 'application/octet-stream') {
					$shouldAdd = false;
				}
			} catch (\Throwable $e) {
				// Detection failed; proceed attempting to add.
			}
			if (!$shouldAdd) {
				continue;
			}
			$added = false;
			// Attempt known method names (version differences safeguard)
			foreach (['registerType','addType'] as $method) {
				if (\method_exists($this->mimeTypeLoader, $method)) {
					try {
						/** @psalm-suppress MixedMethodCall */
						$this->mimeTypeLoader->$method($mime, $ext);
						$added = true;
						break;
					} catch (\Throwable $e) {
						// try next method name
					}
				}
			}
			if ($added) {
				if (\method_exists($output, 'info')) { $output->info("Added MIME mapping: .$ext => $mime"); }
			} else {
				if (\method_exists($output, 'warning')) { $output->warning("Could not add MIME mapping: .$ext => $mime"); }
			}
		}
	}
}
