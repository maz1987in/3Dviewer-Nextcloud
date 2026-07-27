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
     * Dependency formats are streamed to public share pages, and the browser needs the
     * real image type to decode a texture. An entry with no content type would be served
     * as application/octet-stream.
     */
    public function testEveryDependencyExtensionHasAContentType(): void
    {
        foreach (SupportedFormats::DEPENDENCY_EXTENSIONS as $ext) {
            $this->assertArrayHasKey(
                $ext,
                SupportedFormats::CONTENT_TYPE_MAP,
                "Dependency extension '{$ext}' has no entry in CONTENT_TYPE_MAP",
            );
        }
    }

    /**
     * Test that no extensions use placeholder MIME types unintentionally.
     */
    public function testNoPlaceholderMimeTypes(): void
    {
        // Formats with no better registered type than the generic binary one.
        $allowedOctetStream = ['fbx', '3ds', '3dm'];

        foreach (SupportedFormats::CONTENT_TYPE_MAP as $ext => $contentType) {
            if (!in_array($ext, SupportedFormats::getModelExtensions(), true)) {
                continue;
            }
            if (in_array($ext, $allowedOctetStream, true)) {
                continue;
            }

            // The check is "no placeholder", not "starts with model/". Requiring a
            // model/ prefix was wrong for everything this app gained after the mesh
            // formats: there is no model/gcode, .bim is JSON and .fcstd is a ZIP, so
            // the rule could only be satisfied by inventing MIME types.
            $this->assertNotSame(
                'application/octet-stream',
                $contentType,
                "Extension '{$ext}' falls back to the generic binary type; give it a real MIME type or add it to the allow-list"
            );
            $this->assertMatchesRegularExpression(
                '#^[a-z]+/[a-zA-Z0-9.+_-]+$#',
                $contentType,
                "Extension '{$ext}' has '{$contentType}', which is not a MIME type"
            );
        }
    }
}
