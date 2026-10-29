<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCA\ThreeDViewer\Service\EmbedService;
use OCA\ThreeDViewer\Service\EmbedTarget;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\ApiRoute;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\PublicShareController;
use OCP\IRequest;
use OCP\ISession;
use OCP\IURLGenerator;

/**
 * What the embed page shows for a token: the model, and the links around it.
 *
 * MUST extend PublicShareController, for the reason PublicFileController gives: the
 * middleware checks the share, and throttles bad tokens, only for instances of it. A
 * token is valid here only when its share may be embedded (EmbedService), so a share
 * that gained a password, expired, or went is refused before show() runs, and a
 * password-protected share never reaches the password check: a frame has nowhere to ask.
 *
 * @psalm-suppress UnusedClass Routed via attribute registration in Nextcloud runtime.
 */
class PublicEmbedController extends PublicShareController
{
    private ?EmbedTarget $target = null;

    private bool $resolved = false;

    public function __construct(
        string $appName,
        IRequest $request,
        ISession $session,
        private readonly EmbedService $embed,
        private readonly IURLGenerator $urls,
    ) {
        parent::__construct($appName, $request, $session);
    }

    public function isValidToken(): bool
    {
        return $this->target() !== null;
    }

    protected function isPasswordProtected(): bool
    {
        $password = $this->target()?->share->getPassword();

        return $password !== null && $password !== '';
    }

    protected function getPasswordHash(): ?string
    {
        return $this->target()?->share->getPassword();
    }

    private function target(): ?EmbedTarget
    {
        if (!$this->resolved) {
            $this->target = $this->embed->embeddable($this->getToken());
            $this->resolved = true;
        }

        return $this->target;
    }

    #[PublicPage]
    #[NoCSRFRequired]
    #[ApiRoute(verb: 'GET', url: '/public/embed/{token}')]
    public function show(string $token): JSONResponse
    {
        $target = $this->target();
        if ($target === null) {
            return new JSONResponse(['error' => 'Not found'], Http::STATUS_NOT_FOUND);
        }

        $link = ['token' => $this->getToken()];

        return new JSONResponse([
            'fileId' => $target->file->getId(),
            'filename' => $target->file->getName(),
            'mime' => $target->file->getMimetype(),
            'shareUrl' => $this->urls->linkToRouteAbsolute('files_sharing.Share.showShare', $link),
            'downloadUrl' => $target->canDownload ? $this->urls->linkToRouteAbsolute('files_sharing.Share.downloadShare', $link) : null,
        ]);
    }
}
