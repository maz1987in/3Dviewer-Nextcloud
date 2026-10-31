<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCA\ThreeDViewer\Service\EmbedOrigins;
use OCA\ThreeDViewer\Service\Exception\InvalidEmbedOriginException;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;

/**
 * The admin's list of sites allowed to embed public links. Admins only (no
 * NoAdminRequired), and the request token is checked.
 *
 * @psalm-suppress UnusedClass Routed via attribute registration in Nextcloud runtime.
 */
class EmbedAdminController extends Controller
{
    public function __construct(
        string $appName,
        IRequest $request,
        private readonly EmbedOrigins $origins,
    ) {
        parent::__construct($appName, $request);
    }

    /**
     * @param mixed $origins decoded JSON body field, validated by EmbedOrigins
     */
    #[FrontpageRoute(verb: 'PUT', url: '/admin/embed-origins')]
    public function update(mixed $origins = null): JSONResponse
    {
        try {
            return new JSONResponse(['origins' => $this->origins->save($origins)]);
        } catch (InvalidEmbedOriginException $e) {
            return new JSONResponse(['error' => $e->getMessage(), 'invalid' => $e->getInvalid()], Http::STATUS_BAD_REQUEST);
        }
    }
}
