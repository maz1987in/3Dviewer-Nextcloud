<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Constants;

/**
 * Centralized definition of supported 3D model formats and MIME types.
 *
 * This is the single source of truth for all format-related configurations in PHP.
 * It MUST stay synchronized with:
 *  - src/config/viewer-config.js::SUPPORTED_FORMATS (frontend)
 *  - appinfo/mimetypemapping.json (Nextcloud file mapping)
 *
 * @see https://www.iana.org/assignments/media-types/media-types.xhtml
 */
class SupportedFormats
{
    /**
     * Extension to MIME type mappings for 3D model formats.
     *
     * Format: 'extension' => ['mime/type']
     *
     * NOTE: Some extensions map to multiple MIME types for compatibility.
     */
    public const EXT_MIME_MAP = [
        // Primary 3D model formats
        'glb' => ['model/gltf-binary'],
        'gltf' => ['model/gltf+json'],
        'obj' => ['model/obj'],
        'stl' => ['model/stl'],
        'ply' => ['model/ply'],
        'dae' => ['model/vnd.collada+xml'],
        'fbx' => ['model/x.fbx', 'application/octet-stream'], // Both MIME types for compatibility
        '3mf' => ['model/3mf'],
        '3ds' => ['application/x-3ds', 'application/octet-stream'], // Both MIME types for compatibility
        'x3d' => ['model/x3d+xml'],
        'vrml' => ['model/vrml'],
        'wrl' => ['model/vrml'], // VRML alternative extension

        // Material/texture files
        'mtl' => ['text/plain'],
    ];

    /**
     * Extension to content type mapping for file streaming.
     *
     * This is used when serving files through the API.
     * Format: 'extension' => 'content/type'
     */
    public const CONTENT_TYPE_MAP = [
        // 3D model formats
        'glb' => 'model/gltf-binary',
        'gltf' => 'model/gltf+json',
        'obj' => 'model/obj',
        'stl' => 'model/stl',
        'ply' => 'model/ply',
        'dae' => 'model/vnd.collada+xml',
        'fbx' => 'application/octet-stream',
        '3mf' => 'model/3mf',
        '3ds' => 'application/octet-stream',
        'x3d' => 'model/x3d+xml',
        'vrml' => 'model/vrml',
        'wrl' => 'model/vrml',

        // Material file
        'mtl' => 'text/plain',

        // Binary data (GLTF buffers)
        'bin' => 'application/octet-stream',

        // Texture formats
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'tga' => 'image/x-tga',
        'bmp' => 'image/bmp',
        'webp' => 'image/webp',
    ];

    /**
     * List of all supported model file extensions (excluding textures and dependencies).
     *
     * @return list<string>
     */
    public static function getModelExtensions(): array
    {
        return array_keys(self::EXT_MIME_MAP);
    }

    /**
     * List of all supported extensions including textures and dependencies.
     *
     * @return list<string>
     */
    public static function getAllSupportedExtensions(): array
    {
        return array_keys(self::CONTENT_TYPE_MAP);
    }

    /**
     * Check if an extension is a supported model format.
     */
    public static function isModelFormat(string $ext): bool
    {
        return isset(self::EXT_MIME_MAP[strtolower($ext)]);
    }

    /**
     * Check if an extension is supported (including textures/dependencies).
     */
    public static function isSupported(string $ext): bool
    {
        return isset(self::CONTENT_TYPE_MAP[strtolower($ext)]);
    }

    /**
     * Get content type for a given extension.
     */
    public static function getContentType(string $ext): string
    {
        return self::CONTENT_TYPE_MAP[strtolower($ext)] ?? 'application/octet-stream';
    }

    /**
     * Get MIME types for a given extension (for registration).
     *
     * @return list<string>
     */
    public static function getMimeTypes(string $ext): array
    {
        return self::EXT_MIME_MAP[strtolower($ext)] ?? [];
    }
}
