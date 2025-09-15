<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use OCP\IUserSession;
use RuntimeException;
use OCA\ThreeDViewer\Service\Exception\UnsupportedFileTypeException;
use OCA\ThreeDViewer\Service\Exception\UnauthorizedException;
use OCA\ThreeDViewer\Service\ModelFileSupport;

/**
 * Service responsible for resolving & validating 3D model files.
 * (Public share token support to be added later.)
 */
/**
 * @psalm-suppress MissingDependency Nextcloud runtime provides dependent classes in full environment.
 * @psalm-suppress PossiblyUnusedMethod Service constructed via DI container runtime, not visible to static scanner.
 */
class FileService {
    /** @psalm-suppress PossiblyUnusedMethod Constructed via DI container */
    public function __construct(
        private readonly IRootFolder $rootFolder,
        private readonly IUserSession $userSession,
        private readonly ModelFileSupport $support,
    ) {}

    /**
     * Resolve a file by numeric fileId ensuring current user has access and extension is supported.
     *
     * @throws NotFoundException if file not found or not a file
     * @throws RuntimeException if extension unsupported or no user session
     */
    /**
     * @throws NotFoundException
     * @throws UnauthorizedException
     * @throws UnsupportedFileTypeException
     */
    public function getValidatedFile(int $fileId): File {
        $user = $this->userSession->getUser();
        if ($user === null) {
            throw new UnauthorizedException('No authenticated user');
        }
    $userFolder = $this->rootFolder->getUserFolder($user->getUID());
    /** @psalm-var list<Node> $byId */
    $byId = $userFolder->getById($fileId);
    $node = $byId[0] ?? null;
        if (!$node instanceof File) {
            throw new NotFoundException('File not found');
        }
        $ext = strtolower($node->getExtension());
        if (!$this->support->isSupported($ext)) {
            throw new UnsupportedFileTypeException('Unsupported file type');
        }
        return $node;
    }

    /**
     * Attempt to locate a sibling material file (.mtl) for a given OBJ file by filename.
     * @throws RuntimeException|NotFoundException
     */
    /**
     * @throws NotFoundException
     * @throws UnauthorizedException
     * @throws UnsupportedFileTypeException
     */
    public function getSiblingMaterialFile(int $objFileId, string $mtlName): File {
        $objFile = $this->getValidatedFile($objFileId);
        return $this->support->findSiblingMtl($objFile, $mtlName);
    }

    /**
     * @return list<string>
     */
    /** @psalm-suppress PossiblyUnusedMethod Used by future features & documentation endpoints */
    public function getSupportedExtensions(): array { return $this->support->getSupportedExtensions(); }
}
