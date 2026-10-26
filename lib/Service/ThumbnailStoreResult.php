<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

/**
 * Outcome of offering a thumbnail to ThumbnailService::store().
 */
enum ThumbnailStoreResult: string
{
    /** The thumbnail was written. */
    case Stored = 'stored';

    /** A thumbnail already exists for this file version; the first write wins. */
    case Exists = 'exists';

    /** The payload is not a PNG of an accepted size. */
    case InvalidImage = 'invalid';
}
