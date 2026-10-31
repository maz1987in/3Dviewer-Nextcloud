<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCA\ThreeDViewer\Service\Exception\InvalidFileSettingException;
use OCA\ThreeDViewer\Service\FileSettingsService;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\NoteAccess;
use OCA\ThreeDViewer\Service\NoteAccessResult;
use OCA\ThreeDViewer\Service\ResponseBuilder;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\ICacheFactory;
use OCP\IRequest;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;

/**
 * A model's shared settings, for signed-in users: anyone who can open the file reads
 * them, and anyone who can edit it changes them. No route carries NoCSRFRequired.
 *
 * @psalm-suppress UnusedClass Routed via attribute registration in Nextcloud runtime.
 */
class FileSettingsController extends BaseController
{
    public function __construct(
        string $appName,
        IRequest $request,
        private readonly IUserSession $userSession,
        private readonly NoteAccess $access,
        private readonly FileSettingsService $settings,
        ResponseBuilder $responseBuilder,
        ModelFileSupport $modelFileSupport,
        LoggerInterface $logger,
        ICacheFactory $cacheFactory,
    ) {
        parent::__construct($appName, $request, $responseBuilder, $modelFileSupport, $logger, $cacheFactory);
    }

    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/file-settings/{fileId}')]
    public function show(int $fileId): JSONResponse
    {
        [, $access] = $this->resolve($fileId);
        if ($access === null) {
            return $this->notFound();
        }

        return new JSONResponse(['canEdit' => $access->canEdit] + $this->settings->settings($fileId));
    }

    /**
     * Saves the body's `unit` and/or `up`, read from the request rather than as arguments:
     * a field that is present but null clears that setting, and one left out is kept.
     * FileSettingsService validates them.
     */
    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'PUT', url: '/api/file-settings/{fileId}')]
    public function update(int $fileId): JSONResponse
    {
        [$uid, $access] = $this->resolve($fileId);
        if ($access === null) {
            return $this->notFound();
        }
        if (!$access->canEdit) {
            return new JSONResponse(['error' => 'This model is view-only for you'], Http::STATUS_FORBIDDEN);
        }
        // `null` clears a setting; a body with neither field is a mistake, not a request to
        $changes = array_intersect_key($this->request->getParams(), ['unit' => true, 'up' => true]);
        if ($changes === []) {
            return new JSONResponse(['error' => 'Nothing to change'], Http::STATUS_BAD_REQUEST);
        }

        try {
            $stored = $this->settings->set($fileId, $access->fileName, $changes, $uid);
        } catch (InvalidFileSettingException $e) {
            return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
        }

        return new JSONResponse(['canEdit' => true] + $stored);
    }

    /**
     * @return array{0: string, 1: ?NoteAccessResult}
     */
    private function resolve(int $fileId): array
    {
        $uid = $this->userSession->getUser()?->getUID();
        if ($uid === null || $fileId <= 0) {
            return ['', null];
        }

        return [$uid, $this->access->forUser($fileId, $uid)];
    }

    /** Same answer whether the file doesn't exist or the caller can't see it. */
    private function notFound(): JSONResponse
    {
        return new JSONResponse(['error' => 'Not found'], Http::STATUS_NOT_FOUND);
    }
}
