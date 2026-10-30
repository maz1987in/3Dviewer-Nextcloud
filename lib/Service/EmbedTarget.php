<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCP\Files\File;

/**
 * The model a share shows in a frame on a listed site, and whether it may be downloaded.
 */
final class EmbedTarget
{
    public function __construct(
        public readonly File $file,
        public readonly bool $canDownload,
    ) {
    }
}
