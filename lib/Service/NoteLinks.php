<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCP\IURLGenerator;

/**
 * The address of a model in the viewer, and of a note on it.
 *
 * A note's link is the model's own page with `?note=<id>`: the viewer opens the model,
 * frames it as it would for anyone, and focuses the note (src/utils/viewLink.js). Nextcloud's
 * access rules decide who gets in, so a link that reaches someone who can't open the model
 * shows them nothing about it.
 */
class NoteLinks
{
    /** The query parameter the viewer reads a note's id from; keep in step with src/utils/viewLink.js */
    public const NOTE_PARAM = 'note';

    /** @psalm-suppress PossiblyUnusedMethod Constructed by the DI container */
    public function __construct(
        private readonly IURLGenerator $urls,
    ) {
    }

    public function forFile(int $fileId): string
    {
        return $this->urls->linkToRouteAbsolute('threedviewer.page.viewer', ['fileId' => (string) $fileId]);
    }

    public function forNote(int $fileId, int $noteId): string
    {
        return $this->forFile($fileId) . '?' . self::NOTE_PARAM . '=' . $noteId;
    }
}
