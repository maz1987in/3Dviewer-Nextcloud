<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCA\ThreeDViewer\Constants\SupportedFormats;
use OCA\ThreeDViewer\Db\NoteMapper;
use OCA\ThreeDViewer\Service\FileSettingsService;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\ModelStatsService;
use OCA\ThreeDViewer\Service\ModelStatsStoreResult;
use OCA\ThreeDViewer\Service\NoteAccess;
use OCA\ThreeDViewer\Service\NoteAccessResult;
use OCA\ThreeDViewer\Service\ResponseBuilder;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\UserRateLimit;
use OCP\AppFramework\Http\JSONResponse;
use OCP\ICacheFactory;
use OCP\IRequest;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;

/**
 * What the Files sidebar's "3D" tab shows of a model, for signed-in users: the numbers the
 * browser measured of the file's current version, the unit and direction chosen for it, and
 * how many notes it has.
 *
 * Anyone who can read the file reads them, and anyone who can read it may store a
 * measurement of its current version, because the browser that opens the tab is the one
 * with the model loaded and a view-only user's browser is as good a measurer as an
 * editor's. What makes that safe is what is stored: ModelStatsService accepts only the
 * fields it names, within bounds, only under the ETag the server says is current, and
 * keeps the first measurement of a version. No route carries NoCSRFRequired.
 *
 * @psalm-suppress UnusedClass Routed via attribute registration in Nextcloud runtime.
 */
class ModelStatsController extends BaseController
{
    /** Largest request body taken for a measurement; the JSON is a few hundred bytes. */
    private const MAX_BODY_BYTES = 8192;

    public function __construct(
        string $appName,
        IRequest $request,
        private readonly IUserSession $userSession,
        private readonly NoteAccess $access,
        private readonly ModelStatsService $stats,
        private readonly FileSettingsService $settings,
        private readonly NoteMapper $notes,
        ResponseBuilder $responseBuilder,
        ModelFileSupport $modelFileSupport,
        LoggerInterface $logger,
        ICacheFactory $cacheFactory,
    ) {
        parent::__construct($appName, $request, $responseBuilder, $modelFileSupport, $logger, $cacheFactory);
    }

    /**
     * The model's current version, its measurement (null when this version has none yet),
     * the settings chosen for it and its notes.
     *
     * @param int $fileId The model
     */
    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/stats/{fileId}')]
    public function show(int $fileId): JSONResponse
    {
        $access = $this->resolve($fileId);
        if ($access === null) {
            return $this->notFound();
        }

        try {
            $file = $access->file;
            $etag = $file?->getEtag() ?? '';

            return new JSONResponse([
                'fileId' => $fileId,
                'name' => $access->fileName,
                'size' => (int) ($file?->getSize() ?? 0),
                'etag' => $etag,
                'canEdit' => $access->canEdit,
                'stats' => $this->stats->get($fileId, $etag),
                'settings' => $this->settings->settings($fileId),
                'notes' => [
                    'count' => $this->notes->countByFile($fileId),
                    'firstId' => $this->notes->firstIdByFile($fileId),
                ],
            ]);
        } catch (\Throwable $e) {
            $this->logger->error('ModelStatsController: Failed to read the statistics', [
                'fileId' => $fileId,
                'exception' => $e,
            ]);

            return $this->responseBuilder->createErrorResponse('Failed to read the statistics', Http::STATUS_INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Store the measurement of the current version of a model. The first measurement of a
     * version is kept.
     *
     * @param int $fileId The model
     * @param string $etag The ETag of the version the browser measured
     * @param mixed $stats The measurement; ModelStatsService names its fields
     */
    #[NoAdminRequired]
    #[UserRateLimit(limit: 120, period: 60)]
    #[FrontpageRoute(verb: 'POST', url: '/api/stats/{fileId}')]
    public function store(int $fileId, string $etag = '', mixed $stats = null): JSONResponse
    {
        $user = $this->userSession->getUser();
        if ($user === null) {
            return $this->responseBuilder->createUnauthorizedResponse('User not authenticated');
        }
        if ($etag === '') {
            return $this->responseBuilder->createBadRequestResponse('The etag parameter is required');
        }
        if ((int) $this->request->getHeader('Content-Length') > self::MAX_BODY_BYTES) {
            return new JSONResponse(['error' => 'The statistics are too large'], Http::STATUS_REQUEST_ENTITY_TOO_LARGE);
        }

        $access = $this->resolve($fileId);
        if ($access === null || $access->file === null) {
            return $this->notFound();
        }

        try {
            // The version is whatever the server says it is now; a client that measured an
            // older one must not have its numbers filed under the newer ETag.
            $currentEtag = $access->file->getEtag();
            if (!hash_equals($currentEtag, $etag)) {
                return new JSONResponse(['status' => 'stale'], Http::STATUS_PRECONDITION_FAILED);
            }

            $result = $this->stats->store($fileId, $currentEtag, $stats, $user->getUID());
        } catch (\Throwable $e) {
            $this->logger->error('ModelStatsController: Failed to store the statistics', [
                'fileId' => $fileId,
                'exception' => $e,
            ]);

            return $this->responseBuilder->createErrorResponse('Failed to store the statistics', Http::STATUS_INTERNAL_SERVER_ERROR);
        }

        return match ($result) {
            ModelStatsStoreResult::Stored => new JSONResponse(['status' => 'stored'], Http::STATUS_CREATED),
            ModelStatsStoreResult::Exists => new JSONResponse(['status' => 'exists'], Http::STATUS_CONFLICT),
            ModelStatsStoreResult::Invalid => $this->responseBuilder->createBadRequestResponse('The statistics are not accepted'),
        };
    }

    /**
     * The user's access to the model, or null for no user, an id that is not a model file the
     * user can read, or a file that is not a model: the same answer for each, so it says
     * nothing about whether an id exists.
     */
    private function resolve(int $fileId): ?NoteAccessResult
    {
        $uid = $this->userSession->getUser()?->getUID();
        if ($uid === null || $fileId <= 0) {
            return null;
        }

        $access = $this->access->forUser($fileId, $uid);
        if ($access === null || !in_array(strtolower(pathinfo($access->fileName, PATHINFO_EXTENSION)), SupportedFormats::getThumbnailExtensions(), true)) {
            return null;
        }

        return $access;
    }

    private function notFound(): JSONResponse
    {
        return new JSONResponse(['error' => 'Not found'], Http::STATUS_NOT_FOUND);
    }
}
