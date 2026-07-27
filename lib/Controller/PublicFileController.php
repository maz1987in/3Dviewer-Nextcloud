<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCA\ThreeDViewer\Service\Exception\UnsupportedFileTypeException;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\ShareFileService;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\ApiRoute;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\StreamResponse;
use OCP\AppFramework\PublicShareController;
use OCP\Files\NotFoundException;
use OCP\IRequest;
use OCP\ISession;
use OCP\Share\IShare;
use RuntimeException;

/**
 * Public (unauthenticated) streaming of shared 3D files via share token.
 *
 * MUST extend PublicShareController rather than plain Controller: PublicShareMiddleware
 * returns early for anything that is not a PublicShareController instance, so a
 * `#[PublicPage]` controller performs no share authorisation at all and will serve
 * password-protected shares to any caller holding the token. Extending it delegates
 * password and token validation to the framework, and brings brute-force throttling
 * with it.
 *
 * @psalm-suppress UnusedClass Routed via attribute registration in Nextcloud runtime.
 */
class PublicFileController extends PublicShareController
{
    /**
     * Memoises the share lookup: the middleware calls isValidToken(), then
     * isAuthenticated() reaches isPasswordProtected() and getPasswordHash(), which
     * would otherwise each hit the share backend for one request.
     */
    private ?IShare $resolvedShare = null;

    private bool $shareResolved = false;

    public function __construct(
        string $appName,
        IRequest $request,
        ISession $session,
        private readonly ShareFileService $shareFileService,
        private readonly ModelFileSupport $support,
    ) {
        parent::__construct($appName, $request, $session);
    }

    /**
     * Whether the token maps to a share that is reachable without a session at all.
     * Password protection is handled separately by isAuthenticated().
     */
    public function isValidToken(): bool
    {
        return $this->share() !== null;
    }

    protected function isPasswordProtected(): bool
    {
        $password = $this->share()?->getPassword();

        return $password !== null && $password !== '';
    }

    protected function getPasswordHash(): ?string
    {
        return $this->share()?->getPassword();
    }

    private function share(): ?IShare
    {
        if (!$this->shareResolved) {
            $this->resolvedShare = $this->shareFileService->findValidLinkShare($this->getToken());
            $this->shareResolved = true;
        }

        return $this->resolvedShare;
    }

    #[PublicPage]
    #[NoCSRFRequired]
    #[ApiRoute(verb: 'GET', url: '/public/file/{token}/{fileId}')] // fileId optional? kept required for determinism
    public function stream(string $token, int $fileId): StreamResponse|JSONResponse
    {
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
        $response->addHeader('Content-Length', (string) $file->getSize());

        // Use RFC 2231 encoding for proper filename handling
        $filename = $file->getName();
        $encoded = rawurlencode($filename);
        $response->addHeader('Content-Disposition', "inline; filename*=UTF-8''{$encoded}");

        $response->addHeader('Cache-Control', 'no-store');

        return $response;
    }

    /**
     * Stream a companion file the shared model declares — its material, that material's
     * textures, or a glTF buffer.
     *
     * Keyed by name rather than by file id because the id would have to come from the
     * file-listing API, which needs a session. ModelDependencyResolver is what stops a
     * name from being a way to read whatever else sits beside the model.
     */
    #[PublicPage]
    #[NoCSRFRequired]
    #[ApiRoute(verb: 'GET', url: '/public/file/{token}/{fileId}/dep/{name}')]
    public function streamDependency(string $token, int $fileId, string $name): StreamResponse|JSONResponse
    {
        try {
            $file = $this->shareFileService->getDependencyFromShare($token, $fileId, $name);
        } catch (NotFoundException $e) {
            return new JSONResponse(['error' => 'Dependency not found'], Http::STATUS_NOT_FOUND);
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
        // Textures have to arrive as their real image type or the browser will not
        // decode them into a texture.
        $response->addHeader('Content-Type', $this->support->mapContentType(strtolower($file->getExtension())));
        $response->addHeader('Content-Length', (string) $file->getSize());
        $response->addHeader('Cache-Control', 'no-store');

        return $response;
    }

    /**
     * Materials only. Superseded by streamDependency(), which serves the whole chain;
     * kept because this URL is published in the app's API documentation.
     *
     * @deprecated use the /dep/{name} route
     */
    #[PublicPage]
    #[NoCSRFRequired]
    #[ApiRoute(verb: 'GET', url: '/public/file/{token}/{fileId}/mtl/{mtlName}')]
    public function streamSiblingMtl(string $token, int $fileId, string $mtlName): StreamResponse|JSONResponse
    {
        return $this->streamDependency($token, $fileId, $mtlName);
    }
}
