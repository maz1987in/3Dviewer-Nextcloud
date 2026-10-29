<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCP\Files\File;
use OCP\Share\IShare;

/**
 * A share that may be shown in a frame on a listed site, and the model it shares.
 */
final class EmbedTarget
{
    public function __construct(
        public readonly IShare $share,
        public readonly File $file,
        public readonly bool $canDownload,
    ) {
    }
}
