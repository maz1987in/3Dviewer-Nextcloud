<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCA\ThreeDViewer\Service\Exception\UnsupportedFileTypeException;
use OCA\ThreeDViewer\Service\FileSettingsService;
use OCA\ThreeDViewer\Service\ShareFileService;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\ApiRoute;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\PublicShareController;
use OCP\Files\NotFoundException;
use OCP\IRequest;
use OCP\ISession;
use OCP\Share\IShare;

/**
 * A shared model's settings, read-only, for visitors on a public link.
 *
 * MUST extend PublicShareController, for the reason PublicFileController gives: the
 * middleware enforces share passwords only for instances of it (GHSA-gjh8-x4wm-3cfj).
 * The share lookup is PublicNotesController's.
 *
 * @psalm-suppress UnusedClass Routed via attribute registration in Nextcloud runtime.
 */
class PublicFileSettingsController extends PublicShareController
{
    private ?IShare $resolvedShare = null;

    private bool $shareResolved = false;

    public function __construct(
        string $appName,
        IRequest $request,
        ISession $session,
        private readonly ShareFileService $shareFileService,
        private readonly FileSettingsService $settings,
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
        if (!$this->shareResolved) {
            $this->resolvedShare = $this->shareFileService->findValidLinkShare($this->getToken());
            $this->shareResolved = true;
        }

        return $this->resolvedShare;
    }

    #[PublicPage]
    #[NoCSRFRequired]
    #[ApiRoute(verb: 'GET', url: '/public/file-settings/{token}/{fileId}')]
    public function show(string $token, int $fileId): JSONResponse
    {
        try {
            $file = $this->shareFileService->getFileFromShare($token, $fileId);
        } catch (NotFoundException|UnsupportedFileTypeException) {
            return new JSONResponse(['error' => 'Not found'], Http::STATUS_NOT_FOUND);
        }

        // The id of the file the share resolved to, never the id the caller sent
        return new JSONResponse(['canEdit' => false, 'unit' => $this->settings->unit($file->getId())]);
    }
}
