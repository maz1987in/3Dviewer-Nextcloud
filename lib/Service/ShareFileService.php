<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCA\ThreeDViewer\Service\Exception\UnsupportedFileTypeException;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use OCP\Share\IManager as ShareManager;
use OCP\Share\IShare;
use RuntimeException;

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
            throw new UnsupportedFileTypeException('Unsupported file type');
        }
        return $node;
    }

    /**
     * Locate a sibling .mtl file for an OBJ within a share by OBJ fileId + mtlName.
     * @throws NotFoundException
     * @throws UnsupportedFileTypeException
     */
    public function getSiblingMaterialFromShare(string $token, int $objFileId, string $mtlName): File
    {
        $obj = $this->getFileFromShare($token, $objFileId);
        return $this->support->findSiblingMtl($obj, $mtlName);
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
        // Some Nextcloud versions expose getShareByToken(string $token): ?IShare
        $share = $this->shareManager->getShareByToken($token);
        /** @psalm-suppress DocblockTypeContradiction Legacy interface may return null */
        if ($share === null) {
            throw new NotFoundException('Share not found');
        }
        return $share;
    }
}
