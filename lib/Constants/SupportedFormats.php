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
        'xyz' => ['application/x-xyz-pointcloud'], // Point cloud as text; a chemistry .xyz is refused by the viewer
        'pcd' => ['application/x-pcd'], // Point Cloud Library point cloud
        'las' => ['application/vnd.las'], // ASPRS LAS survey / LiDAR point cloud
        'laz' => ['application/vnd.laszip'], // LAS compressed with LASzip
        'e57' => ['model/e57'], // ASTM E57 laser scan

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
        'xyz' => 'application/x-xyz-pointcloud',
        'pcd' => 'application/x-pcd',
        'las' => 'application/vnd.las',
        'laz' => 'application/vnd.laszip',
        'e57' => 'model/e57',

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
     * Companion files a model may reference — materials, glTF buffers and textures.
     *
     * Not derivable from the two maps above: `mtl` appears in EXT_MIME_MAP so Nextcloud
     * registers a MIME type for it, but having a registered type is not the same as being
     * a format the viewer can open on its own.
     *
     * Every entry must also appear in CONTENT_TYPE_MAP, since these are streamed;
     * FormatSyncTest holds that line.
     */
    /**
     * Formats that hold scans, which the viewer thins as it reads (src/pointclouds/limits.js),
     * so they may run to SCAN_MAX_BYTES. A PLY may be a scan or a mesh; the viewer refuses
     * a mesh PLY over the ordinary limit itself.
     */
    public const POINT_CLOUD_EXTENSIONS = ['las', 'laz', 'e57', 'pcd', 'xyz', 'ply'];

    /** The largest scan the viewer opens; the viewer's SCAN_CEILING_BYTES. */
    public const SCAN_MAX_BYTES = 2 * 1024 * 1024 * 1024;

    public const DEPENDENCY_EXTENSIONS = [
        'mtl',
        'bin',
        'png',
        'jpg',
        'jpeg',
        'tga',
        'bmp',
        'webp',
    ];

    /**
     * The extensions this app may map, given a site's own mapping: all of EXT_MIME_MAP but
     * those the site already maps to a type the app doesn't use (a chemistry server's
     * .xyz as chemical/x-xyz, say). The repair steps neither claim nor reset those.
     *
     * @param array<array-key, mixed> $existing config/mimetypemapping.json, decoded
     * @return array<string, list<string>>
     */
    public static function mappableExtensions(array $existing): array
    {
        $mappable = [];
        foreach (self::EXT_MIME_MAP as $ext => $mimes) {
            $theirs = self::firstMime($existing[$ext] ?? null);
            if ($theirs === null || in_array($theirs, $mimes, true)) {
                $mappable[$ext] = $mimes;
            }
        }

        return $mappable;
    }

    /**
     * @param mixed $mapping One extension's entry in a mimetypemapping.json
     * @return ?string Its first MIME type, if it has one
     * @psalm-suppress MixedInferredReturnType, MixedReturnStatement is_string() narrows $mapping[0]
     */
    private static function firstMime(mixed $mapping): ?string
    {
        if (is_string($mapping)) {
            return $mapping;
        }

        return is_array($mapping) && isset($mapping[0]) && is_string($mapping[0]) ? $mapping[0] : null;
    }

    /**
     * @param string $file A mimetypemapping.json
     * @return array<array-key, mixed> Its mapping, or none when it is missing or unreadable
     * @psalm-suppress MixedAssignment json_decode's result is checked before it is returned
     */
    public static function readMapping(string $file): array
    {
        if (!file_exists($file)) {
            return [];
        }
        $decoded = json_decode((string) file_get_contents($file), true);

        return is_array($decoded) ? $decoded : [];
    }

    /**
     * List of all supported model file extensions (excluding textures and dependencies).
     *
     * @return list<string>
     */
    public static function getModelExtensions(): array
    {
        return array_values(array_filter(
            array_keys(self::EXT_MIME_MAP),
            static fn (string $ext): bool => !self::isDependencyFormat($ext)
        ));
    }

    /**
     * Extensions that get a Files-app thumbnail: every model, never a companion file.
     *
     * @return list<string>
     */
    public static function getThumbnailExtensions(): array
    {
        return self::getModelExtensions();
    }

    /**
     * Anchored regex for registering the preview provider.
     *
     * Matches the primary MIME type of every model extension. Secondary types such as
     * `application/octet-stream` (fbx, 3ds, 3dm) are never first, so generic files stay out.
     */
    public static function getPreviewMimeRegex(): string
    {
        $primary = array_unique(array_map(
            static fn (string $ext): string => self::EXT_MIME_MAP[$ext][0],
            self::getModelExtensions()
        ));

        return '/^(' . implode('|', array_map(static fn (string $mime): string => preg_quote($mime, '/'), $primary)) . ')$/';
    }

    /**
     * Whether an extension is a companion file rather than a model in its own right.
     */
    public static function isDependencyFormat(string $ext): bool
    {
        return in_array(strtolower($ext), self::DEPENDENCY_EXTENSIONS, true);
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
