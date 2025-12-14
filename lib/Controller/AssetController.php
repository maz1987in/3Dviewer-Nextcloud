<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\FileDisplayResponse;
use OCP\IRequest;
use OCP\IURLGenerator;

class AssetController extends Controller
{
    public function __construct(
        IRequest $request,
        private IURLGenerator $urlGenerator
    ) {
        parent::__construct('threedviewer', $request);
    }

    /**
     * Catch-all route for /asset/* paths
     * This route matches any path starting with /asset/ and manually parses it
     * IMPORTANT: Must be registered to handle nested paths with slashes
     * Using /asset/img pattern to match image assets with nested paths.
     */
    #[NoCSRFRequired]
    #[PublicPage]
    #[FrontpageRoute(verb: 'GET', url: '/asset/img/{filename}')]
    public function serveAsset(string $filename = ''): FileDisplayResponse
    {
        // Get the full request URI to parse the path manually
        // Nextcloud routes don't handle slashes in parameters, so we parse the full URI
        $requestUri = $this->request->getRequestUri();
        $pathInfo = parse_url($requestUri, PHP_URL_PATH);

        // Remove /apps/threedviewer prefix if present
        $pathInfo = preg_replace('#^/apps/threedviewer#', '', $pathInfo);

        // Extract full path after /asset/img/
        // Pattern: /asset/img/...everything after...
        // Example: /asset/img/slicers/prusaslicer.png -> type=img, path=slicers/prusaslicer.png
        if (preg_match('#^/asset/img/(.+)$#', $pathInfo, $matches)) {
            $fullPath = $matches[1];

            // Use the parsed path (e.g., "slicers/prusaslicer.png")
            return $this->serveAssetInternal('img', $fullPath);
        }

        // Fallback: try to use the filename parameter if it contains slashes
        if (!empty($filename)) {
            return $this->serveAssetInternal('img', $filename);
        }

        throw new \InvalidArgumentException("Invalid asset path: {$pathInfo}");
    }

    /**
     * Internal method to serve assets.
     */
    private function serveAssetInternal(string $type, string $filename): FileDisplayResponse
    {
        $appRoot = dirname(__DIR__, 2);

        // Handle img/slicers/ subdirectory
        if ($type === 'img') {
            // $filename could be "slicers/prusaslicer.png"
            $filePath = $appRoot . '/img/' . $filename;
        } else {
            $allowedTypes = ['draco', 'basis'];

            if (!in_array($type, $allowedTypes)) {
                throw new \InvalidArgumentException("Invalid asset type: {$type}");
            }

            $filePath = $appRoot . '/' . $type . '/' . $filename;
        }

        // Check file exists first
        if (!file_exists($filePath)) {
            throw new \InvalidArgumentException("Asset not found: {$filename}");
        }

        // Normalize path to prevent directory traversal attacks
        $normalizedPath = realpath($filePath);
        $normalizedRoot = realpath($appRoot);

        if ($normalizedPath === false || $normalizedRoot === false || strpos($normalizedPath, $normalizedRoot) !== 0) {
            throw new \InvalidArgumentException("Asset path invalid: {$filename}");
        }

        $filePath = $normalizedPath;

        $mimeType = $this->getMimeType($filename);

        return new FileDisplayResponse($filePath, $mimeType);
    }

    /**
     * Serve decoder files directly from root.
     * @NoCSRFRequired
     * @PublicPage
     */
    public function serveDecoder(string $filename): FileDisplayResponse
    {
        $appRoot = dirname(__DIR__, 2);
        $filePath = $appRoot . '/' . $filename;

        if (!file_exists($filePath)) {
            throw new \InvalidArgumentException('Asset not found');
        }

        $mimeType = $this->getMimeType($filename);

        return new FileDisplayResponse($filePath, $mimeType);
    }

    private function getMimeType(string $filename): string
    {
        $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));

        return match ($extension) {
            'wasm' => 'application/wasm',
            'js' => 'application/javascript',
            'png' => 'image/png',
            'jpg', 'jpeg' => 'image/jpeg',
            'svg' => 'image/svg+xml',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            default => 'application/octet-stream'
        };
    }
}
