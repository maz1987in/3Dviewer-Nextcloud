<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Preview;

use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\ThumbnailService;
use OCP\Files\File;
use OCP\IUserSession;
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
    private ThumbnailService $thumbnailService;
    private IUserSession $userSession;

    /** @var list<string> Supported MIME types for thumbnails */
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

    /** @var list<string> Formats supported for thumbnail generation (common formats only) */
    private array $thumbnailSupportedFormats = ['glb', 'gltf', 'obj', 'stl', 'ply'];

    public function __construct(
        ModelFileSupport $modelFileSupport,
        ThumbnailService $thumbnailService,
        IUserSession $userSession
    ) {
        $this->modelFileSupport = $modelFileSupport;
        $this->thumbnailService = $thumbnailService;
        $this->userSession = $userSession;
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
     * Returns stored client-generated thumbnail if available, otherwise returns false
     * to use filetype icons. Only supports common formats (GLB, GLTF, OBJ, STL, PLY).
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
        // Check if format is supported for thumbnails
        $extension = strtolower(pathinfo($file->getName(), PATHINFO_EXTENSION));
        if (!in_array($extension, $this->thumbnailSupportedFormats, true)) {
            return false;
        }

        // Get current user (may be null in background contexts)
        $user = $this->userSession->getUser();
        if ($user === null) {
            // No user session (e.g., in cron job) - can't access user-specific thumbnails
            return false;
        }

        $userId = $user->getUID();
        $fileId = $file->getId();

        // Try to get stored thumbnail content
        $thumbnailContent = $this->thumbnailService->getThumbnailContent($fileId, $userId);
        if ($thumbnailContent !== null) {
            // Try to create image resource from content
            if (function_exists('imagecreatefromstring')) {
                $resource = @imagecreatefromstring($thumbnailContent);
                if ($resource !== false) {
                    return $resource;
                }
            }
            // If GD not available, return false (can't return raw content)
            // Nextcloud preview system requires resource or file path
        }

        // No thumbnail available - return false to use filetype icon
        return false;
    }
}
