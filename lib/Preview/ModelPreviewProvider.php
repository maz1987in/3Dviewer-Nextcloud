<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Preview;

use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCP\Files\File;
use OCP\Preview\IProvider2;

/**
 * Preview provider for 3D model files.
 *
 * This provider can be enabled/disabled by Nextcloud admins via the
 * `enabledPreviewProviders` config option in config/config.php:
 *
 * 'enabledPreviewProviders' => [
 *     'OC\Preview\Image',
 *     'OC\Preview\TXT',
 *     'OCA\ThreeDViewer\Preview\ModelPreviewProvider',
 * ],
 *
 * When enabled, this provider will attempt to generate previews for 3D model files.
 * When disabled or when preview generation fails, Nextcloud automatically falls back
 * to displaying custom filetype SVG icons registered via mimetypemapping.json.
 */
class ModelPreviewProvider implements IProvider2
{
    private ModelFileSupport $modelFileSupport;

    /** @var list<string> Supported MIME types */
    private array $supportedMimes = [
        'model/gltf-binary',        // .glb
        'model/gltf+json',          // .gltf
        'model/obj',                // .obj
        'model/stl',                // .stl
        'application/sla',          // .stl alternative
        'model/ply',                // .ply
        'model/vnd.collada+xml',    // .dae
        'model/3mf',                // .3mf
        'model/x3d+xml',            // .x3d
        'model/vrml',               // .vrml, .wrl
        // Generic MIME types that need extension check
        'application/octet-stream', // Used for fbx, 3ds
    ];

    public function __construct(ModelFileSupport $modelFileSupport)
    {
        $this->modelFileSupport = $modelFileSupport;
    }

    /**
     * Check if this provider supports a given file.
     */
    public function isAvailable(File $file): bool
    {
        $mimeType = $file->getMimeType();
        $extension = strtolower(pathinfo($file->getName(), PATHINFO_EXTENSION));

        // Check by MIME type
        if (in_array($mimeType, $this->supportedMimes, true)) {
            // For generic application/octet-stream, verify extension
            if ($mimeType === 'application/octet-stream') {
                return $this->modelFileSupport->isSupported($extension) &&
                       in_array($extension, ['fbx', '3ds'], true);
            }

            return true;
        }

        // Fallback: check by extension
        return $this->modelFileSupport->isSupported($extension);
    }

    /**
     * Get the supported MIME types for this provider.
     *
     * @return list<string>
     */
    public function getMimeType(): string
    {
        // Return empty string - we handle multiple MIME types in isAvailable()
        // Returning empty allows isAvailable() to determine support per file
        return '';
    }

    /**
     * Generate a preview image for a 3D model file.
     *
     * Currently returns false to use filetype icons until proper server-side
     * rendering is implemented. Future implementation could:
     * - Render 3D models server-side using headless rendering
     * - Use cached client-rendered screenshots
     * - Generate previews from model metadata
     *
     * @param File $file The file to generate a preview for
     * @param int $maxX Maximum width of the preview
     * @param int $maxY Maximum height of the preview
     * @param bool $scalingUp Whether to scale up smaller images
     * @param \OCP\Files\FileInfo $fileInfo File info object
     * @return bool|resource|string False if preview cannot be generated, otherwise image resource or file path
     */
    public function getThumbnail(
        File $file,
        int $maxX,
        int $maxY,
        bool $scalingUp,
        ?\OCP\Files\FileInfo $fileInfo = null
    ): bool {
        // For now, return false to use filetype icons
        // This allows admins to enable the provider without breaking anything
        // Future: Implement actual 3D model rendering here

        return false;
    }
}
