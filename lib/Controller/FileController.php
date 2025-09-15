<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCA\ThreeDViewer\AppInfo\Application;
use OCA\ThreeDViewer\Service\FileService;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\ApiRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\StreamResponse;
use OCP\Files\NotFoundException;
use OCP\IRequest;
use RuntimeException;
use OCA\ThreeDViewer\Service\Exception\UnsupportedFileTypeException;
use OCA\ThreeDViewer\Service\Exception\UnauthorizedException;

/**
 * Streams validated 3D model files to the frontend viewer.
 * (Future: public share token variant + range support if needed.)
 *
 * @psalm-suppress UnusedClass The controller is referenced indirectly via Nextcloud's routing system.
 */
class FileController extends Controller {
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
    #[ApiRoute(verb: 'GET', url: '/file/{fileId}')]
    /**
     * @return StreamResponse|JSONResponse
     */
    public function stream(int $fileId): StreamResponse|JSONResponse {
        try {
            $file = $this->fileService->getValidatedFile($fileId);
        } catch (NotFoundException $e) {
            return new JSONResponse(['error' => 'File not found'], Http::STATUS_NOT_FOUND);
        } catch (UnauthorizedException $e) {
            return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_UNAUTHORIZED);
        } catch (UnsupportedFileTypeException $e) {
            return new JSONResponse(['error' => $e->getMessage()], 415); // Unsupported Media Type
        } catch (RuntimeException $e) { // fallback
            return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
        }

    $ext = strtolower($file->getExtension());
    $contentType = $this->support->mapContentType($ext);
        $stream = $file->fopen('r');
        if ($stream === false) {
            return new JSONResponse(['error' => 'Failed to open file'], Http::STATUS_INTERNAL_SERVER_ERROR);
        }
        $response = new StreamResponse($stream);
        $response->addHeader('Content-Type', $contentType);
        $response->addHeader('Content-Length', (string)$file->getSize());
        $response->addHeader('Content-Disposition', 'inline; filename="' . addslashes($file->getName()) . '"');
        $response->addHeader('Cache-Control', 'no-store');

        return $response;
    }

    #[NoAdminRequired]
    #[NoCSRFRequired]
    #[ApiRoute(verb: 'GET', url: '/file/{fileId}/mtl/{mtlName}')] // mtlName raw; Nextcloud router handles encoding
    /**
     * @return StreamResponse|JSONResponse
     */
    public function streamSiblingMtl(int $fileId, string $mtlName): StreamResponse|JSONResponse {
        try {
            $file = $this->fileService->getSiblingMaterialFile($fileId, $mtlName);
        } catch (NotFoundException $e) {
            return new JSONResponse(['error' => 'MTL not found'], Http::STATUS_NOT_FOUND);
        } catch (UnauthorizedException $e) {
            return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_UNAUTHORIZED);
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
