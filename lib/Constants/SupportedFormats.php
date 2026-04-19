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
        'gcode' => ['text/x-gcode'], // G-code toolpath format
        'gco' => ['text/x-gcode'], // G-code alternative extension
        'nc' => ['text/x-gcode'], // CNC G-code extension
        'acode' => ['text/x-gcode'], // AnkerMake G-code extension
        'gx' => ['application/x-gcode'], // FlashForge G-code
        'g' => ['text/x-gcode'], // Generic G-code
        'g3drem' => ['application/x-gcode'], // Dremel G-code
        'makerbot' => ['application/x-gcode'], // Makerbot G-code
        'thing' => ['application/x-gcode'], // Makerbot Thing format

        // Additional mesh / CAD formats
        'off' => ['model/off'], // Geomview OFF (plain-text)
        'amf' => ['application/x-amf', 'model/amf'], // Additive Manufacturing Format (XML, optionally zipped)
        '3dm' => ['model/3dm', 'application/octet-stream'], // Rhinoceros 3DM
        'bim' => ['application/dotbim+json'], // dotbim (JSON-based BIM)
        'ifc' => ['application/x-step', 'application/ifc'], // Industry Foundation Classes (BIM, STEP-based text)
        'step' => ['model/step', 'application/step'], // STEP ISO 10303
        'stp' => ['model/step', 'application/step'], // STEP alternative extension
        'iges' => ['model/iges', 'application/iges'], // IGES
        'igs' => ['model/iges', 'application/iges'], // IGES alternative extension
        'brep' => ['model/brep', 'application/x-brep'], // OpenCascade native B-Rep
        'brp' => ['model/brep', 'application/x-brep'], // BREP alternative extension
        'fcstd' => ['application/x-fcstd'], // FreeCAD native document (ZIP + BREP)

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
        'gcode' => 'text/x-gcode',
        'gco' => 'text/x-gcode',
        'nc' => 'text/x-gcode',
        'acode' => 'text/x-gcode',
        'gx' => 'application/x-gcode',
        'g' => 'text/x-gcode',
        'g3drem' => 'application/x-gcode',
        'makerbot' => 'application/x-gcode',
        'thing' => 'application/x-gcode',
        'off' => 'model/off',
        'amf' => 'application/x-amf',
        '3dm' => 'model/3dm',
        'bim' => 'application/dotbim+json',
        'ifc' => 'application/x-step',
        'step' => 'model/step',
        'stp' => 'model/step',
        'iges' => 'model/iges',
        'igs' => 'model/iges',
        'brep' => 'model/brep',
        'brp' => 'model/brep',
        'fcstd' => 'application/x-fcstd',

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
