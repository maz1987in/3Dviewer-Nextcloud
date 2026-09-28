<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\Files\NotPermittedException;

/**
 * Rights over a model's notes, derived from the model file on every request.
 *
 * Never from the note: a note has no permissions of its own, so anything that asked the
 * note would be asking the wrong thing.
 */
class NoteAccess
{
    public function __construct(
        private readonly IRootFolder $rootFolder,
    ) {
    }

    public function forUser(int $fileId, string $uid): ?NoteAccessResult
    {
        try {
            $home = $this->rootFolder->getUserFolder($uid);
        } catch (NotPermittedException) {
            return null;
        } catch (\Exception) {
            // getUserFolder() throws the server-internal NoUserException for an unknown
            // user. Naming it would reach into private API (NoPrivateServerApiTest), so any
            // other failure to resolve the folder means the same thing: no access.
            return null;
        }

        $nodes = $home->getById($fileId);

        $files = array_filter($nodes, static fn ($node) => $node instanceof File);
        if ($files === []) {
            return null;
        }

        foreach ($files as $file) {
            if ($file->isUpdateable()) {
                return new NoteAccessResult(true);
            }
        }

        return new NoteAccessResult(false);
    }
}
