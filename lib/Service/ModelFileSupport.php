<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCA\ThreeDViewer\Constants\SupportedFormats;
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
 * SYNC NOTE: Format definitions now centralized in lib/Constants/SupportedFormats.php
 *            which MUST stay synchronized with:
 *            - src/config/viewer-config.js::SUPPORTED_FORMATS (frontend)
 *            - appinfo/mimetypemapping.json (Nextcloud file mapping)
 */
class ModelFileSupport
{
    /** @return list<string> */
    public function getSupportedExtensions(): array
    {
        return SupportedFormats::getAllSupportedExtensions();
    }

    public function isSupported(string $ext): bool
    {
        return SupportedFormats::isSupported($ext);
    }

    public function mapContentType(string $ext): string
    {
        return SupportedFormats::getContentType($ext);
    }

    /**
     * Find sibling MTL in parent folder (case-insensitive filename match).
     * @throws NotFoundException
     * @throws UnsupportedFileTypeException
     */
    public function findSiblingMtl(File $objFile, string $mtlName): File
    {
        if (strtolower($objFile->getExtension()) !== 'obj') {
            throw new UnsupportedFileTypeException('Not an OBJ file', 0, null, $objFile->getExtension());
        }
        $parent = $objFile->getParent();
        /* @psalm-suppress DocblockTypeContradiction */
        if ($parent === null) {
            throw new NotFoundException('Parent folder missing');
        }
        foreach ($parent->getDirectoryListing() as $node) {
            if ($node instanceof File && strcasecmp($node->getName(), $mtlName) === 0) {
                if (strtolower($node->getExtension()) !== 'mtl') {
                    throw new UnsupportedFileTypeException('Sibling is not an MTL file', 0, null, $node->getExtension());
                }

                return $node;
            }
        }

        throw new NotFoundException('MTL not found');
    }
}
