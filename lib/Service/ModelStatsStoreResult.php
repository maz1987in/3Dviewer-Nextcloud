<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

/**
 * Outcome of offering a model's statistics to ModelStatsService::store().
 */
enum ModelStatsStoreResult: string
{
    /** The statistics were written. */
    case Stored = 'stored';

    /** This file version already has statistics; the first write wins. */
    case Exists = 'exists';

    /** The payload is not statistics this service accepts. */
    case Invalid = 'invalid';
}
