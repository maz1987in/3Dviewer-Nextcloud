<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Preview;

use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\ThumbnailService;
use OCP\Files\File;
use OCP\Files\FileInfo;
use OCP\IImage;
use OCP\IUserSession;
use OCP\Preview\IProviderV2;

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
class ModelPreviewProvider implements IProviderV2
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

    /** @var list<string> Formats supported for thumbnail generation */
    private array $thumbnailSupportedFormats = ['glb', 'gltf', 'obj', 'stl', 'ply', '3mf', 'fbx', 'dae', '3ds', 'x3d', 'wrl', 'vrml'];

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
     * Get the supported MIME type regex for this provider.
     *
     * @return string Regex pattern matching supported MIME types
     */
    public function getMimeType(): string
    {
        // Return regex that matches 3D model MIME types
        return '/^model\/.*/';
    }

    /**
     * Check if this provider can generate a preview for a given file.
     *
     * Only returns true if we have a stored client-generated thumbnail.
     * This allows Nextcloud to fall back to mime type icons for files
     * that haven't been viewed yet.
     *
     * @param FileInfo $file The file info to check
     * @return bool True if we have a thumbnail available
     */
    public function isAvailable(FileInfo $file): bool
    {
        $extension = strtolower(pathinfo($file->getName(), PATHINFO_EXTENSION));

        // Check if file type is supported
        if (!in_array($extension, $this->thumbnailSupportedFormats, true)) {
            return false;
        }

        // Check if we have a stored thumbnail
        $user = $this->userSession->getUser();
        if ($user === null) {
            return false;
        }

        $fileId = $file->getId();
        if ($fileId === null) {
            return false;
        }

        // Only return true if thumbnail actually exists
        return $this->thumbnailService->hasThumbnail($fileId, $user->getUID());
    }

    /**
     * Generate a preview image for a 3D model file.
     *
     * Returns stored client-generated thumbnail if available, otherwise returns null
     * to use filetype icons.
     *
     * @param File $file The file to generate a preview for
     * @param int $maxX Maximum width of the preview
     * @param int $maxY Maximum height of the preview
     * @return IImage|null The preview image, or null if not available
     */
    public function getThumbnail(File $file, int $maxX, int $maxY): ?IImage
    {
        // Check if format is supported for thumbnails
        $extension = strtolower(pathinfo($file->getName(), PATHINFO_EXTENSION));
        if (!in_array($extension, $this->thumbnailSupportedFormats, true)) {
            return null;
        }

        // Get current user (may be null in background contexts)
        $user = $this->userSession->getUser();
        if ($user === null) {
            // No user session (e.g., in cron job) - can't access user-specific thumbnails
            return null;
        }

        $userId = $user->getUID();
        $fileId = $file->getId();

        // Try to get stored thumbnail content
        $thumbnailContent = $this->thumbnailService->getThumbnailContent($fileId, $userId);
        if ($thumbnailContent !== null) {
            // Try to create image from content using Nextcloud's OC_Image
            try {
                $image = new \OCP\Image();
                if ($image->loadFromData($thumbnailContent)) {
                    // Resize if needed
                    if ($image->width() > $maxX || $image->height() > $maxY) {
                        $image->resize(max($maxX, $maxY));
                    }

                    return $image;
                }
            } catch (\Throwable $e) {
                // Failed to load image, return null
            }
        }

        // No thumbnail available - return null to use filetype icon
        return null;
    }
}
