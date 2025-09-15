<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCA\ThreeDViewer\Service\ShareFileService;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\Exception\UnsupportedFileTypeException;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\ApiRoute;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\StreamResponse;
use OCP\Files\NotFoundException;
use OCP\IRequest;
use RuntimeException;

/**
 * Public (unauthenticated) streaming of shared 3D files via share token.
 *
 * @psalm-suppress UnusedClass Routed via attribute registration in Nextcloud runtime.
 */
class PublicFileController extends Controller {
    public function __construct(
        string $appName,
        IRequest $request,
    private readonly ShareFileService $shareFileService,
    private readonly ModelFileSupport $support,
    ) {
        parent::__construct($appName, $request);
    }

    #[PublicPage]
    #[NoCSRFRequired]
    #[ApiRoute(verb: 'GET', url: '/public/file/{token}/{fileId}')] // fileId optional? kept required for determinism
    public function stream(string $token, int $fileId): StreamResponse|JSONResponse {
        try {
            $file = $this->shareFileService->getFileFromShare($token, $fileId);
        } catch (NotFoundException $e) {
            return new JSONResponse(['error' => 'File not found'], Http::STATUS_NOT_FOUND);
        } catch (UnsupportedFileTypeException $e) {
            return new JSONResponse(['error' => $e->getMessage()], 415);
        } catch (RuntimeException $e) {
            return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
        }
        $stream = $file->fopen('r');
        if ($stream === false) {
            return new JSONResponse(['error' => 'Failed to open file'], Http::STATUS_INTERNAL_SERVER_ERROR);
        }
        $response = new StreamResponse($stream);
    $response->addHeader('Content-Type', $this->support->mapContentType(strtolower($file->getExtension())));
        $response->addHeader('Content-Length', (string)$file->getSize());
        $response->addHeader('Content-Disposition', 'inline; filename="' . addslashes($file->getName()) . '"');
        $response->addHeader('Cache-Control', 'no-store');
        return $response;
    }

    #[PublicPage]
    #[NoCSRFRequired]
    #[ApiRoute(verb: 'GET', url: '/public/file/{token}/{fileId}/mtl/{mtlName}')]
    public function streamSiblingMtl(string $token, int $fileId, string $mtlName): StreamResponse|JSONResponse {
        try {
            $file = $this->shareFileService->getSiblingMaterialFromShare($token, $fileId, $mtlName);
        } catch (NotFoundException $e) {
            return new JSONResponse(['error' => 'MTL not found'], Http::STATUS_NOT_FOUND);
        } catch (UnsupportedFileTypeException $e) {
            return new JSONResponse(['error' => $e->getMessage()], 415);
        } catch (RuntimeException $e) {
            return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
        }
        $stream = $file->fopen('r');
        if ($stream === false) {
            return new JSONResponse(['error' => 'Failed to open file'], Http::STATUS_INTERNAL_SERVER_ERROR);
        }
        $response = new StreamResponse($stream);
        $response->addHeader('Content-Type', 'text/plain');
        $response->addHeader('Content-Length', (string)$file->getSize());
        $response->addHeader('Cache-Control', 'no-store');
        return $response;
    }
}
