<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Preview;

use OCA\ThreeDViewer\Constants\SupportedFormats;
use OCA\ThreeDViewer\Service\ThumbnailService;
use OCP\Files\File;
use OCP\Files\FileInfo;
use OCP\IImage;
use OCP\Preview\IProviderV2;
use Psr\Log\LoggerInterface;

/**
 * Preview provider for 3D model files.
 *
 * Nextcloud caches the preview this provider returns per file, for every user, so the
 * provider must not depend on who is asking: it is called for other users, by cron and
 * for public-link visitors, none of whom have the session that uploaded the thumbnail.
 * Thumbnails are stored once per file version (see ThumbnailService), so a lookup by
 * file id and ETag serves any reader and never serves a thumbnail of an older version.
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
 * When enabled, this provider returns the stored thumbnail of a model file. When
 * disabled, or when there is no thumbnail for the current version, Nextcloud falls
 * back to the custom filetype SVG icons registered via mimetypemapping.json.
 */
class ModelPreviewProvider implements IProviderV2
{
    public function __construct(
        private readonly ThumbnailService $thumbnailService,
        private readonly LoggerInterface $logger,
    ) {
    }

    /**
     * Get the supported MIME type regex for this provider.
     *
     * Derived from the supported formats, so formats whose MIME type is not `model/*`
     * (ifc, fcstd, gcode) are covered too.
     *
     * @return string Regex pattern matching supported MIME types
     */
    public function getMimeType(): string
    {
        return SupportedFormats::getPreviewMimeRegex();
    }

    /**
     * Check if this provider can generate a preview for a given file.
     *
     * Only returns true if we have a stored client-generated thumbnail for the file's
     * current version. This allows Nextcloud to fall back to mime type icons for files
     * that haven't been viewed yet.
     *
     * @param FileInfo $file The file info to check
     * @return bool True if we have a thumbnail available
     */
    public function isAvailable(FileInfo $file): bool
    {
        if (!$this->isThumbnailFormat($file->getName())) {
            return false;
        }

        $key = $this->versionKey($file->getId(), $file->getEtag());
        if ($key === null) {
            return false;
        }

        try {
            return $this->thumbnailService->has($key[0], $key[1]);
        } catch (\Throwable $e) {
            // A broken thumbnail store must not break a folder listing.
            $this->logger->warning('Could not check for a stored thumbnail', ['exception' => $e, 'fileId' => $key[0]]);

            return false;
        }
    }

    /**
     * Generate a preview image for a 3D model file.
     *
     * Returns the stored client-generated thumbnail if there is one for the file's
     * current version, otherwise null to use filetype icons.
     *
     * @param File $file The file to generate a preview for
     * @param int $maxX Maximum width of the preview
     * @param int $maxY Maximum height of the preview
     * @return IImage|null The preview image, or null if not available
     */
    public function getThumbnail(File $file, int $maxX, int $maxY): ?IImage
    {
        if (!$this->isThumbnailFormat($file->getName())) {
            return null;
        }

        $key = $this->versionKey($file->getId(), $file->getEtag());
        if ($key === null) {
            return null;
        }

        try {
            $bytes = $this->thumbnailService->get($key[0], $key[1]);
            if ($bytes === null) {
                return null;
            }

            $image = $this->createImage($bytes);
            if ($image === null) {
                return null;
            }

            if ($image->width() > $maxX || $image->height() > $maxY) {
                $image->resize(max($maxX, $maxY));
            }

            return $image;
        } catch (\Throwable $e) {
            // Unreadable or undecodable thumbnail: fall back to the filetype icon.
            $this->logger->warning('Could not load the stored thumbnail', ['exception' => $e, 'fileId' => $key[0]]);

            return null;
        }
    }

    /**
     * Seam for testing: `\OCP\Image` extends a server-internal class and cannot be
     * constructed in a unit test.
     *
     * @return IImage|null The decoded image, or null if the bytes are not an image
     */
    protected function createImage(string $data): ?IImage
    {
        $image = new \OCP\Image();

        return $image->loadFromData($data) ? $image : null;
    }

    private function isThumbnailFormat(string $name): bool
    {
        return in_array(strtolower(pathinfo($name, PATHINFO_EXTENSION)), SupportedFormats::getThumbnailExtensions(), true);
    }

    /**
     * @return array{int, string}|null The thumbnail key, or null when the file has no id or ETag
     */
    private function versionKey(?int $fileId, ?string $etag): ?array
    {
        if ($fileId === null || $etag === null || $etag === '') {
            return null;
        }

        return [$fileId, $etag];
    }
}
