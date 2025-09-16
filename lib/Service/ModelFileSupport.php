<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCA\ThreeDViewer\Service\Exception\UnsupportedFileTypeException;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\Node;
use OCP\Files\NotFoundException;

/**
 * Central place for model file support concerns:
 *  - Supported extension allow-list
 *  - Content type mapping
 *  - Sibling MTL resolution
 */
class ModelFileSupport {
    /** @var list<string> */
    private array $supported = ['glb','gltf','obj','stl','ply','mtl','fbx','3mf','3ds'];

    /** @return list<string> */
    public function getSupportedExtensions(): array {
        return $this->supported;
    }

    public function isSupported(string $ext): bool {
        return in_array(strtolower($ext), $this->supported, true);
    }

    public function mapContentType(string $ext): string {
        return match (strtolower($ext)) {
            'glb' => 'model/gltf-binary',
            'gltf' => 'model/gltf+json',
            'obj' => 'model/obj',
            'stl' => 'model/stl',
            'ply' => 'model/ply',
            'mtl' => 'text/plain',
            'fbx' => 'application/octet-stream', // No well-standardized registered model MIME; using generic
            '3mf' => 'model/3mf',
            '3ds' => 'application/octet-stream', // Legacy 3D Studio format
            default => 'application/octet-stream',
        };
    }

    /**
     * Find sibling MTL in parent folder (case-insensitive filename match).
     * @throws NotFoundException
     * @throws UnsupportedFileTypeException
     */
    public function findSiblingMtl(File $objFile, string $mtlName): File {
        if (strtolower($objFile->getExtension()) !== 'obj') {
            throw new UnsupportedFileTypeException('Not an OBJ file');
        }
        $parent = $objFile->getParent();
        /** @psalm-suppress DocblockTypeContradiction */
        if ($parent === null) {
            throw new NotFoundException('Parent folder missing');
        }
        foreach ($parent->getDirectoryListing() as $node) {
            if ($node instanceof File && strcasecmp($node->getName(), $mtlName) === 0) {
                if (strtolower($node->getExtension()) !== 'mtl') {
                    throw new UnsupportedFileTypeException('Sibling is not an MTL file');
                }
                return $node;
            }
        }
        throw new NotFoundException('MTL not found');
    }
}
