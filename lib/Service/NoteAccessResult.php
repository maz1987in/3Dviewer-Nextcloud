<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

/**
 * What a signed-in user may do with a model's notes and settings. Reading is implied by
 * existing. `fileName` is the name of the file the rights were judged by, for the routes
 * that depend on its format.
 */
final class NoteAccessResult
{
    public function __construct(
        public readonly bool $canEdit,
        public readonly string $fileName = '',
    ) {
    }
}
