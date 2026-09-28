<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

/**
 * What a signed-in user may do with a model's notes. Reading is implied by existing.
 */
final class NoteAccessResult
{
    public function __construct(
        public readonly bool $canEdit,
    ) {
    }
}
