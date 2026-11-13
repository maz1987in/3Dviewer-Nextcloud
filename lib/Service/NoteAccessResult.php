<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCP\Files\File;

/**
 * What a signed-in user may do with a model's notes and settings. Reading is implied by
 * existing. `fileName` is the name of the file the rights were judged by, for the routes
 * that depend on its format; `file` is that file and `path` where the user sees it, relative
 * to their home and without a leading slash, for what announces a change to a note.
 */
final class NoteAccessResult
{
    public function __construct(
        public readonly bool $canEdit,
        public readonly string $fileName = '',
        public readonly ?File $file = null,
        public readonly string $path = '',
    ) {
    }
}
