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
     * Serve decoder assets (WASM files, etc.) and images
     * Supports: /apps/threedviewer/draco/{filename}, /apps/threedviewer/basis/{filename}, and /apps/threedviewer/img/{subdir}/{filename}.
     */
    #[NoCSRFRequired]
    #[PublicPage]
    #[FrontpageRoute(verb: 'GET', url: '/{type}/{filename}')]
    public function serveAsset(string $type, string $filename): FileDisplayResponse
    {
        $appRoot = dirname(__DIR__, 2);
        
        // Handle img/slicers/ subdirectory
        if ($type === 'img') {
            // $filename could be "slicers/prusaslicer.png"
            $filePath = $appRoot . '/img/' . $filename;
        } else {
            $allowedTypes = ['draco', 'basis'];
            
            if (!in_array($type, $allowedTypes)) {
                throw new \InvalidArgumentException('Invalid asset type');
            }
            
            $filePath = $appRoot . '/' . $type . '/' . $filename;
        }

        if (!file_exists($filePath)) {
            throw new \InvalidArgumentException('Asset not found');
        }

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
