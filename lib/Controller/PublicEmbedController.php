<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCA\ThreeDViewer\Service\EmbedService;
use OCA\ThreeDViewer\Service\ShareFileService;
use OCP\AppFramework\Http\Attribute\ApiRoute;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\PublicShareController;
use OCP\Files\NotFoundException;
use OCP\IRequest;
use OCP\ISession;
use OCP\IURLGenerator;
use OCP\Share\IShare;

/**
 * What the embed page shows for a token: the model, and the links around it.
 *
 * MUST extend PublicShareController, for the reason PublicFileController gives: the
 * middleware checks the share, and throttles bad tokens, only for instances of it.
 *
 * A token is valid when it names a readable, unexpired share, so only what looks like
 * guessing is throttled, with one exception: a deleted or expired share counts, and so
 * does one with a password, which the middleware refuses as core refuses any request
 * that has not given it. A frame has nowhere to give it. One that exists but may not be
 * embedded otherwise (a folder, a file that is not a model, embedding off) does not
 * count: embeds load on their own, several to a page, on every visit, and each count
 * slows every embed for that address, then locks them out. show() refuses those with
 * the middleware's own "not found", so they read exactly as a share that went.
 *
 * @psalm-suppress UnusedClass Routed via attribute registration in Nextcloud runtime.
 */
class PublicEmbedController extends PublicShareController
{
    private ?IShare $share = null;

    private bool $resolved = false;

    public function __construct(
        string $appName,
        IRequest $request,
        ISession $session,
        private readonly ShareFileService $shares,
        private readonly EmbedService $embed,
        private readonly IURLGenerator $urls,
    ) {
        parent::__construct($appName, $request, $session);
    }

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
        if (!$this->resolved) {
            $this->share = $this->shares->findValidLinkShare($this->getToken());
            $this->resolved = true;
        }

        return $this->share;
    }

    #[PublicPage]
    #[NoCSRFRequired]
    #[ApiRoute(verb: 'GET', url: '/public/embed/{token}')]
    public function show(string $token): JSONResponse
    {
        $share = $this->share();
        $target = $share === null ? null : $this->embed->embeddable($share);
        if ($target === null) {
            // PublicShareMiddleware answers this as it answers a token that never existed
            throw new NotFoundException();
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
