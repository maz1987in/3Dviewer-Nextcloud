<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Repair;

use OCP\Files\IAppData;
use OCP\Files\NotFoundException;
use OCP\Migration\IOutput;
use OCP\Migration\IRepairStep;

/**
 * Removes the per-user thumbnail store (`thumbnails/<userId>/…`).
 *
 * Thumbnails are now stored once per file version under `thumbnails-v2/`, so the old tree
 * is dead weight. This step only ever touches `thumbnails`, never `thumbnails-v2`.
 *
 * @psalm-suppress UnusedClass Registered through appinfo/info.xml
 */
class RemoveLegacyThumbnails implements IRepairStep
{
    private const LEGACY_FOLDER = 'thumbnails';

    public function __construct(
        private readonly IAppData $appData,
    ) {
    }

    public function getName(): string
    {
        return 'Remove per-user 3D model thumbnails';
    }

    public function run(IOutput $output): void
    {
        try {
            $this->appData->getFolder(self::LEGACY_FOLDER)->delete();
        } catch (NotFoundException) {
            // Nothing to remove: a fresh install, or the step has already run.
            return;
        }

        $output->info('Removed per-user 3D model thumbnails');
    }
}
