<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\ApiRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\StreamResponse;
use OCP\IRequest;
use OCA\ThreeDViewer\Service\FileService;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\Exception\UnsupportedFileTypeException;
use OCA\ThreeDViewer\Service\Exception\UnauthorizedException;
use OCP\Files\NotFoundException;

/**
 * Returns a placeholder thumbnail for supported 3D model files. Future implementation may
 * render an actual preview (server-side or cached client render). For now this simply
 * validates file access & type, then streams a static PNG placeholder.
 */
class ThumbnailController extends Controller
{
    public function __construct(
        string $appName,
        IRequest $request,
        private readonly FileService $fileService,
        private readonly ModelFileSupport $support,
    ) {
        parent::__construct($appName, $request);
    }

    #[NoAdminRequired]
    #[NoCSRFRequired]
    #[ApiRoute(verb: 'GET', url: '/thumb/{fileId}')]
    public function placeholder(int $fileId): StreamResponse|DataResponse
    {
        try {
            $file = $this->fileService->getValidatedFile($fileId); // validates ext & permissions
        } catch (NotFoundException $e) {
            return new DataResponse(['error' => 'File not found'], Http::STATUS_NOT_FOUND);
        } catch (UnauthorizedException $e) {
            return new DataResponse(['error' => $e->getMessage()], Http::STATUS_UNAUTHORIZED);
        } catch (UnsupportedFileTypeException $e) {
            return new DataResponse(['error' => $e->getMessage()], 415);
        }
        // Serve static placeholder PNG.
        $path = __DIR__ . '/../../img/thumbnail-placeholder.png';
        if (!is_file($path)) {
            // Fallback tiny 1x1 PNG if placeholder missing
            $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=');
            $stream = fopen('php://memory', 'r+');
            fwrite($stream, $png);
            rewind($stream);
            $resp = new StreamResponse($stream);
            $resp->addHeader('Content-Type', 'image/png');
            $resp->addHeader('Cache-Control', 'public, max-age=300');
            return $resp;
        }
        $stream = fopen($path, 'rb');
        if ($stream === false) {
            return new DataResponse(['error' => 'Failed to open placeholder'], Http::STATUS_INTERNAL_SERVER_ERROR);
        }
        $resp = new StreamResponse($stream);
        $resp->addHeader('Content-Type', 'image/png');
        $resp->addHeader('Cache-Control', 'public, max-age=300');
        return $resp;
    }
}
