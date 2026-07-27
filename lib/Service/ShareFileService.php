<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCA\ThreeDViewer\Service\Exception\UnsupportedFileTypeException;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use OCP\Share\Exceptions\ShareNotFound;
use OCP\Share\IManager as ShareManager;
use OCP\Share\IShare;

/**
 * Resolve 3D model files through a public share token (anonymous access path).
 * Supports selecting the shared root file or a child by file id.
 */
/**
 * @psalm-suppress PossiblyUnusedMethod Constructed by DI container runtime.
 */
class ShareFileService
{
    /** @psalm-suppress PossiblyUnusedMethod Constructed via DI container */
    public function __construct(
        private readonly ShareManager $shareManager,
        private readonly ModelFileSupport $support,
        private readonly ModelDependencyResolver $dependencies,
    ) {
    }

    /**
     * Resolve the shared node then optionally narrow to a child file by id.
     * @throws NotFoundException
     * @throws UnsupportedFileTypeException
     */
    public function getFileFromShare(string $token, ?int $fileId = null): File
    {
        $share = $this->loadLinkShare($token);
        $node = $share->getNode();
        if ($fileId !== null) {
            if ($node instanceof Folder) {
                $candidate = $this->searchInFolderById($node, $fileId);
                if ($candidate !== null) {
                    $node = $candidate;
                }
            }
        }
        if (!$node instanceof File) {
            throw new NotFoundException('Shared node is not a file');
        }
        $ext = strtolower($node->getExtension());
        if (!$this->support->isSupported($ext)) {
            throw new UnsupportedFileTypeException('Unsupported file type', 0, null, $ext);
        }

        return $node;
    }

    /**
     * Locate a companion file — material, texture or glTF buffer — that the shared model
     * declares, by the name the client read out of the model.
     *
     * Both gates matter and they are separate questions: the share must be publicly
     * readable (here), and the model must actually point at that name
     * (ModelDependencyResolver).
     *
     * @throws NotFoundException
     * @throws UnsupportedFileTypeException
     */
    public function getDependencyFromShare(string $token, int $fileId, string $name): File
    {
        $model = $this->getFileFromShare($token, $fileId);

        return $this->dependencies->resolve($model, $name);
    }

    /**
     * Depth-first search for a file by id inside a folder (small share trees assumed).
     * @return File|null
     */
    private function searchInFolderById(Folder $folder, int $fileId): ?File
    {
        foreach ($folder->getDirectoryListing() as $child) {
            if ($child->getId() === $fileId && $child instanceof File) {
                return $child;
            }
            if ($child instanceof Folder) {
                $found = $this->searchInFolderById($child, $fileId);
                if ($found) {
                    return $found;
                }
            }
        }

        return null;
    }

    /**
     * @throws NotFoundException
     */
    private function loadLinkShare(string $token): IShare
    {
        $share = $this->findValidLinkShare($token);
        if ($share === null) {
            throw new NotFoundException('Share not found');
        }

        return $share;
    }

    /**
     * Resolve a token to a share that is actually publicly shareable.
     *
     * `getShareByToken()` matches on the token alone, so it happily returns shares
     * that have expired or were never public to begin with. Everything reachable
     * without a session must go through this method.
     *
     * Password protection is deliberately NOT checked here: whether the caller
     * satisfied the password is a request-scoped question answered by
     * PublicShareController, which needs the share (and its password hash) in hand
     * to do so. Callers outside that flow must not use this to bypass it.
     */
    public function findValidLinkShare(string $token): ?IShare
    {
        try {
            // Some Nextcloud versions expose getShareByToken(string $token): ?IShare
            $share = $this->shareManager->getShareByToken($token);
        } catch (ShareNotFound) {
            // How the manager reports an unknown *or expired* share. Without this the
            // exception escapes as a 500 and leaks that the token once existed.
            return null;
        }

        /* @psalm-suppress DocblockTypeContradiction Legacy interface may return null */
        if ($share === null) {
            return null;
        }

        // Only link and email shares are reachable anonymously; a user or group
        // share carries a token too, but reaching it requires being that user.
        $shareType = $share->getShareType();
        if ($shareType !== IShare::TYPE_LINK && $shareType !== IShare::TYPE_EMAIL) {
            return null;
        }

        $expiration = $share->getExpirationDate();
        if ($expiration !== null && $expiration->getTimestamp() < time()) {
            return null;
        }

        return $share;
    }
}
