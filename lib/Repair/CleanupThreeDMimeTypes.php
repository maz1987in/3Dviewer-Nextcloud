<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Repair;

use OCP\Files\IMimeTypeLoader;
use OCP\Files\IMimeTypeDetector;
use OCP\Migration\IRepairStep;
use OCP\Migration\IOutput;

/**
 * Optional cleanup step that attempts to remove MIME mappings previously added by
 * RegisterThreeDMimeTypes during uninstall / app disable scenarios.
 *
 * Removal is conservative: only removes when detector reports the exact mapping we would have added
 * OR a generic fallback (to avoid erasing core/other app definitions).
 *
 * NOTE: Actual uninstall orchestration (ensuring this runs) is environment-specific; Nextcloud does not
 * guarantee execution order on uninstall. This step is provided for admins invoking repair chain manually.
 *
 * @psalm-suppress UnusedClass
 */
class CleanupThreeDMimeTypes implements IRepairStep {
	private IMimeTypeLoader $mimeTypeLoader;
	private IMimeTypeDetector $mimeTypeDetector;

	public function __construct(IMimeTypeLoader $mimeTypeLoader, IMimeTypeDetector $mimeTypeDetector) {
		$this->mimeTypeLoader = $mimeTypeLoader;
		$this->mimeTypeDetector = $mimeTypeDetector;
	}

	public function getName(): string {
		return 'Cleanup 3D model MIME types (threedviewer)';
	}

	public function run(IOutput $output): void {
		$targets = [
			'ply' => 'model/ply',
			'fbx' => 'application/octet-stream',
			'mtl' => 'text/plain',
			'3mf' => 'model/3mf',
			'3ds' => 'application/octet-stream',
		];
		foreach ($targets as $ext => $mime) {
			$remove = false;
			try {
				$current = $this->mimeTypeDetector->detectPath("file.$ext");
				if ($current === $mime) {
					$remove = true; // looks like ours
				}
			} catch (\Throwable $e) {
				// If detection fails assume we cannot safely remove
			}
			if (!$remove) {
				continue;
			}
			// Attempt removal via known method names
			$removed = false;
			foreach (['removeType','unregisterType'] as $method) {
				if (\method_exists($this->mimeTypeLoader, $method)) {
					try {
						/** @psalm-suppress MixedMethodCall */
						$this->mimeTypeLoader->$method($mime, $ext);
						$removed = true;
						break;
					} catch (\Throwable $e) {
						// try next
					}
				}
			}
			if ($removed && \method_exists($output, 'info')) {
				$output->info("Removed MIME mapping: .$ext => $mime");
			} elseif (!$removed && \method_exists($output, 'warning')) {
				$output->warning("Could not remove MIME mapping (method missing or failure): .$ext => $mime");
			}
		}
	}
}
