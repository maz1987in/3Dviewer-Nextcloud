<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Constants;

use OCA\ThreeDViewer\Constants\SupportedFormats;
use PHPUnit\Framework\TestCase;

/**
 * Test suite to verify format synchronization across the application.
 *
 * This test ensures that:
 * 1. All formats in SupportedFormats are properly defined
 * 2. Format lists are consistent across different parts of the application
 * 3. No formats are missing from any definition
 */
class SupportedFormatsTest extends TestCase
{
    /**
     * Test that all model extensions have MIME type mappings.
     */
    public function testAllModelExtensionsHaveMimeTypes(): void
    {
        $modelExtensions = SupportedFormats::getModelExtensions();
        $this->assertNotEmpty($modelExtensions, 'Model extensions list should not be empty');

        foreach ($modelExtensions as $ext) {
            $mimeTypes = SupportedFormats::getMimeTypes($ext);
            $this->assertNotEmpty(
                $mimeTypes,
                "Extension '$ext' should have at least one MIME type defined"
            );
        }
    }

    /**
     * Test that all supported extensions have content types.
     */
    public function testAllSupportedExtensionsHaveContentTypes(): void
    {
        $allExtensions = SupportedFormats::getAllSupportedExtensions();
        $this->assertNotEmpty($allExtensions, 'All supported extensions list should not be empty');

        foreach ($allExtensions as $ext) {
            $contentType = SupportedFormats::getContentType($ext);
            $this->assertNotEmpty(
                $contentType,
                "Extension '$ext' should have a content type defined"
            );
            $this->assertNotEquals(
                '',
                $contentType,
                "Content type for '$ext' should not be empty"
            );
        }
    }

    /**
     * Test that critical 3D model formats are present.
     */
    public function testCriticalFormatsArePresent(): void
    {
        $criticalFormats = ['glb', 'gltf', 'obj', 'stl', 'ply', 'dae', 'fbx', '3mf', '3ds', 'x3d', 'vrml', 'wrl'];
        $modelExtensions = SupportedFormats::getModelExtensions();

        foreach ($criticalFormats as $format) {
            $this->assertContains(
                $format,
                $modelExtensions,
                "Critical format '$format' should be in the model extensions list"
            );
            $this->assertTrue(
                SupportedFormats::isModelFormat($format),
                "Critical format '$format' should be recognized as a model format"
            );
        }
    }

    /**
     * Test that dependency files are properly supported.
     */
    public function testDependencyFilesAreSupported(): void
    {
        $dependencies = ['mtl', 'bin'];
        
        foreach ($dependencies as $dep) {
            $this->assertTrue(
                SupportedFormats::isSupported($dep),
                "Dependency file type '$dep' should be supported"
            );
            $this->assertNotEmpty(
                SupportedFormats::getContentType($dep),
                "Dependency file type '$dep' should have a content type"
            );
        }
    }

    /**
     * Test that texture formats are properly supported.
     */
    public function testTextureFormatsAreSupported(): void
    {
        $textureFormats = ['png', 'jpg', 'jpeg', 'tga', 'bmp', 'webp'];
        
        foreach ($textureFormats as $format) {
            $this->assertTrue(
                SupportedFormats::isSupported($format),
                "Texture format '$format' should be supported"
            );
            $contentType = SupportedFormats::getContentType($format);
            $this->assertStringStartsWith(
                'image/',
                $contentType,
                "Texture format '$format' should have an image content type, got '$contentType'"
            );
        }
    }

    /**
     * Test that MIME type mappings are valid.
     */
    public function testMimeTypeMappingsAreValid(): void
    {
        $extMimeMap = SupportedFormats::EXT_MIME_MAP;
        
        foreach ($extMimeMap as $ext => $mimes) {
            $this->assertIsArray($mimes, "MIME types for '$ext' should be an array");
            $this->assertNotEmpty($mimes, "MIME types array for '$ext' should not be empty");
            
            foreach ($mimes as $mime) {
                $this->assertIsString($mime, "MIME type for '$ext' should be a string");
                $this->assertStringContainsString(
                    '/',
                    $mime,
                    "MIME type '$mime' for '$ext' should contain a forward slash"
                );
            }
        }
    }

    /**
     * Test case-insensitive extension handling.
     */
    public function testCaseInsensitiveExtensionHandling(): void
    {
        $testCases = [
            ['glb', 'GLB', 'Glb'],
            ['obj', 'OBJ', 'Obj'],
            ['stl', 'STL', 'Stl'],
        ];

        foreach ($testCases as $cases) {
            $contentTypes = [];
            foreach ($cases as $ext) {
                $contentTypes[] = SupportedFormats::getContentType($ext);
            }
            
            // All case variations should return the same content type
            $this->assertCount(
                1,
                array_unique($contentTypes),
                "Content type should be the same for all case variations of extension: " . implode(', ', $cases)
            );
        }
    }

    /**
     * Test that unsupported extensions return default content type.
     */
    public function testUnsupportedExtensionsReturnDefault(): void
    {
        $unsupportedExtensions = ['xyz', 'unknown', 'test'];
        
        foreach ($unsupportedExtensions as $ext) {
            $this->assertFalse(
                SupportedFormats::isSupported($ext),
                "Extension '$ext' should not be supported"
            );
            $this->assertEquals(
                'application/octet-stream',
                SupportedFormats::getContentType($ext),
                "Unsupported extension '$ext' should return default content type"
            );
        }
    }

    /**
     * Test that EXT_MIME_MAP and CONTENT_TYPE_MAP are synchronized for model formats.
     */
    public function testMimeMapAndContentTypeMapSync(): void
    {
        foreach (SupportedFormats::EXT_MIME_MAP as $ext => $mimes) {
            $this->assertArrayHasKey(
                $ext,
                SupportedFormats::CONTENT_TYPE_MAP,
                "Extension '$ext' from EXT_MIME_MAP should exist in CONTENT_TYPE_MAP"
            );
            
            // Content type should be one of the registered MIME types
            $contentType = SupportedFormats::CONTENT_TYPE_MAP[$ext];
            $this->assertContains(
                $contentType,
                $mimes,
                "Content type '$contentType' for '$ext' should be in the MIME types list"
            );
        }
    }

    /**
     * Test that specific format MIME types match expected values.
     */
    public function testSpecificFormatMimeTypes(): void
    {
        $expectedMimeTypes = [
            'glb' => 'model/gltf-binary',
            'gltf' => 'model/gltf+json',
            'obj' => 'model/obj',
            'stl' => 'model/stl',
            'ply' => 'model/ply',
            'dae' => 'model/vnd.collada+xml',
            'x3d' => 'model/x3d+xml',
            'vrml' => 'model/vrml',
            'wrl' => 'model/vrml',
            '3mf' => 'model/3mf',
            'mtl' => 'text/plain',
        ];

        foreach ($expectedMimeTypes as $ext => $expectedMime) {
            $mimes = SupportedFormats::getMimeTypes($ext);
            $this->assertContains(
                $expectedMime,
                $mimes,
                "Extension '$ext' should have MIME type '$expectedMime'"
            );
        }
    }
}
