<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Constants\SupportedFormats;
use PHPUnit\Framework\TestCase;

/**
 * Test to ensure format definitions stay synchronized across:
 * - lib/Constants/SupportedFormats.php (backend)
 * - src/config/viewer-config.js (frontend)
 * - appinfo/mimetypemapping.json (Nextcloud MIME registration)
 */
class FormatSyncTest extends TestCase
{
    /**
     * Test that all extensions in EXT_MIME_MAP are present in CONTENT_TYPE_MAP.
     */
    public function testExtMimeMapIsSubsetOfContentTypeMap(): void
    {
        $modelExtensions = SupportedFormats::getModelExtensions();
        $allExtensions = SupportedFormats::getAllSupportedExtensions();

        foreach ($modelExtensions as $ext) {
            $this->assertContains(
                $ext,
                $allExtensions,
                "Extension '$ext' is in EXT_MIME_MAP but missing from CONTENT_TYPE_MAP"
            );
        }
    }

    /**
     * Test that mimetypemapping.json contains all model extensions.
     */
    public function testMimetypeMappingJsonSync(): void
    {
        $mappingFile = __DIR__ . '/../../../appinfo/mimetypemapping.json';
        $this->assertFileExists($mappingFile, 'mimetypemapping.json not found');

        $json = json_decode(file_get_contents($mappingFile), true);
        $this->assertIsArray($json, 'Invalid JSON in mimetypemapping.json');
        $this->assertArrayHasKey('mappings', $json, 'Missing "mappings" key in mimetypemapping.json');

        $mappings = $json['mappings'];
        $modelExtensions = SupportedFormats::getModelExtensions();

        foreach ($modelExtensions as $ext) {
            $this->assertArrayHasKey(
                $ext,
                $mappings,
                "Extension '$ext' is in SupportedFormats but missing from mimetypemapping.json"
            );
        }
    }

    /**
     * Test that MIME types match between EXT_MIME_MAP and mimetypemapping.json.
     */
    public function testMimeTypeConsistency(): void
    {
        $mappingFile = __DIR__ . '/../../../appinfo/mimetypemapping.json';
        $json = json_decode(file_get_contents($mappingFile), true);
        $mappings = $json['mappings'];

        foreach (SupportedFormats::EXT_MIME_MAP as $ext => $mimes) {
            $phpMimes = is_array($mimes) ? $mimes : [$mimes];
            $jsonMime = $mappings[$ext] ?? null;

            $this->assertNotNull(
                $jsonMime,
                "Extension '$ext' missing in mimetypemapping.json"
            );

            // JSON should have at least one of the PHP MIME types
            $this->assertContains(
                $jsonMime,
                $phpMimes,
                "MIME type mismatch for '$ext': JSON has '$jsonMime', PHP has " . implode(', ', $phpMimes)
            );
        }
    }

    /**
     * Test that all formats are properly validated by isSupported().
     */
    public function testIsSupportedCoversAllFormats(): void
    {
        $modelExtensions = SupportedFormats::getModelExtensions();

        foreach ($modelExtensions as $ext) {
            $this->assertTrue(
                SupportedFormats::isSupported($ext),
                "Extension '$ext' should be supported but isSupported() returns false"
            );
        }
    }

    /**
     * Test that getContentType() works for all model extensions.
     */
    public function testGetContentTypeCoversAllFormats(): void
    {
        $modelExtensions = SupportedFormats::getModelExtensions();
        // fbx and 3ds legitimately use application/octet-stream as they don't have standard MIME types
        $allowedOctetStream = ['fbx', '3ds'];

        foreach ($modelExtensions as $ext) {
            $contentType = SupportedFormats::getContentType($ext);

            if (!in_array($ext, $allowedOctetStream)) {
                $this->assertNotEquals(
                    'application/octet-stream',
                    $contentType,
                    "Extension '$ext' should have a specific content type, not generic octet-stream (unless explicitly defined)"
                );
            }

            $this->assertNotEmpty($contentType, "Content type for '$ext' should not be empty");
        }
    }

    /**
     * Test critical formats are present.
     */
    public function testCriticalFormatsPresent(): void
    {
        $criticalFormats = ['glb', 'gltf', 'obj', 'stl', 'ply', 'fbx', '3mf', '3ds', 'dae'];
        $modelExtensions = SupportedFormats::getModelExtensions();

        foreach ($criticalFormats as $format) {
            $this->assertContains(
                $format,
                $modelExtensions,
                "Critical format '$format' is missing from SupportedFormats"
            );
        }
    }

    /**
     * Test that no extensions use placeholder MIME types unintentionally.
     */
    public function testNoPlaceholderMimeTypes(): void
    {
        $allowedOctetStream = ['fbx', '3ds']; // These legitimately use octet-stream
        $allowedTextPlain = ['mtl']; // MTL files are text files, not 3D models

        foreach (SupportedFormats::CONTENT_TYPE_MAP as $ext => $contentType) {
            if (in_array($ext, $allowedOctetStream) ||
                in_array($ext, $allowedTextPlain) ||
                !in_array($ext, SupportedFormats::getModelExtensions())) {
                continue;
            }

            $this->assertStringStartsWith(
                'model/',
                $contentType,
                "Extension '$ext' should use 'model/' MIME type, not '$contentType'"
            );
        }
    }
}
