<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCA\ThreeDViewer\Service\Exception\UnsupportedFileTypeException;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\NotFoundException;

/**
 * Central place for model file support concerns:
 *  - Supported extension allow-list
 *  - Content type mapping
 *  - Sibling MTL resolution
 *
 * SYNC NOTE: The 3D model format list is defined in src/config/viewer-config.js (SUPPORTED_FORMATS)
 *            as the single source of truth. This PHP list includes:
 *            - Model formats from SUPPORTED_FORMATS (glb, gltf, obj, stl, ply, fbx, 3mf, 3ds, dae, x3d, vrml, wrl)
 *            - Dependency files: mtl (materials), bin (GLTF buffers)
 *            - Texture formats: png, jpg, jpeg, tga, bmp, webp
 *
 * NOTE: This list MUST stay synchronized with:
 *       - RegisterThreeDMimeTypes::EXT_MIME_MAP
 *       - src/config/viewer-config.js::SUPPORTED_FORMATS
 */
class ModelFileSupport
{
    /** @var list<string> */
    private array $supported = ['glb', 'gltf', 'obj', 'stl', 'ply', 'dae', 'mtl', 'fbx', '3mf', '3ds', 'x3d', 'vrml', 'wrl', 'bin', 'png', 'jpg', 'jpeg', 'tga', 'bmp', 'webp'];

    /** @return list<string> */
    public function getSupportedExtensions(): array
    {
        return $this->supported;
    }

    public function isSupported(string $ext): bool
    {
        return in_array(strtolower($ext), $this->supported, true);
    }

    public function mapContentType(string $ext): string
    {
        return match (strtolower($ext)) {
            'glb' => 'model/gltf-binary',
            'gltf' => 'model/gltf+json',
            'obj' => 'model/obj',
            'stl' => 'model/stl',
            'ply' => 'model/ply',
            'dae' => 'model/vnd.collada+xml', // COLLADA format
            'mtl' => 'text/plain',
            'fbx' => 'application/octet-stream', // No well-standardized registered model MIME; using generic
            '3mf' => 'model/3mf',
            '3ds' => 'application/octet-stream', // Legacy 3D Studio format
            'x3d' => 'model/x3d+xml',
            'vrml', 'wrl' => 'model/vrml', // VRML format (both extensions)
            'bin' => 'application/octet-stream', // Binary data for GLTF buffers
            'png' => 'image/png',
            'jpg', 'jpeg' => 'image/jpeg',
            'tga' => 'image/x-tga',
            'bmp' => 'image/bmp',
            'webp' => 'image/webp',
            default => 'application/octet-stream',
        };
    }

    /**
     * Find sibling MTL in parent folder (case-insensitive filename match).
     * @throws NotFoundException
     * @throws UnsupportedFileTypeException
     */
    public function findSiblingMtl(File $objFile, string $mtlName): File
    {
        if (strtolower($objFile->getExtension()) !== 'obj') {
            throw new UnsupportedFileTypeException('Not an OBJ file');
        }
        $parent = $objFile->getParent();
        /* @psalm-suppress DocblockTypeContradiction */
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
