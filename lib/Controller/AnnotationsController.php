<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCA\ThreeDViewer\Service\AnnotationsService;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\ResponseBuilder;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\Files\IRootFolder;
use OCP\ICacheFactory;
use OCP\IRequest;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;

/**
 * Stores per-file annotation documents in app data so users don't have to
 * manually export/import their annotations between sessions.
 *
 * Routes are scoped per file ID and authenticated. The user must have access
 * to the underlying model file (verified via the user folder lookup) before
 * we'll touch their annotation blob — this prevents leaking or stomping on
 * annotations through guessed file IDs.
 */
class AnnotationsController extends BaseController
{
    public function __construct(
        string $appName,
        IRequest $request,
        private readonly IRootFolder $rootFolder,
        private readonly IUserSession $userSession,
        private readonly AnnotationsService $annotationsService,
        ResponseBuilder $responseBuilder,
        ModelFileSupport $modelFileSupport,
        LoggerInterface $logger,
        ICacheFactory $cacheFactory,
    ) {
        parent::__construct($appName, $request, $responseBuilder, $modelFileSupport, $logger, $cacheFactory);
    }

    /**
     * Retrieve the saved annotation document for a model file.
     *
     * Returns 200 with `{ annotations: <doc> }` when present, 204 when the
     * user has access to the file but has never saved annotations for it.
     */
    #[NoAdminRequired]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/annotations/{fileId}')]
    public function getAnnotations(int $fileId): JSONResponse
    {
        try {
            $fileId = $this->validateFileId($fileId);
            $userId = $this->requireAuthorisedUserForFile($fileId);
            if ($userId === null) {
                return $this->responseBuilder->createNotFoundResponse('File not found');
            }

            $payload = $this->annotationsService->load($fileId, $userId);
            if ($payload === null) {
                return new JSONResponse(['annotations' => null], Http::STATUS_NO_CONTENT);
            }

            $decoded = json_decode($payload, true);
            if (!is_array($decoded)) {
                $this->logger->warning('AnnotationsController: stored payload is not valid JSON', [
                    'fileId' => $fileId,
                    'userId' => $userId,
                ]);

                return $this->responseBuilder->createErrorResponse(
                    'Stored annotations could not be parsed',
                    Http::STATUS_INTERNAL_SERVER_ERROR,
                );
            }

            return new JSONResponse(['annotations' => $decoded]);
        } catch (\Throwable $e) {
            return $this->handleException($e);
        }
    }

    /**
     * Save the annotation document for a model file.
     *
     * The body must be a JSON object matching the export schema:
     *   { format: 'threedviewer-annotations', version: 1, annotations: [...] }
     */
    #[NoAdminRequired]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'PUT', url: '/api/annotations/{fileId}')]
    public function saveAnnotations(int $fileId): JSONResponse
    {
        try {
            $fileId = $this->validateFileId($fileId);
            $userId = $this->requireAuthorisedUserForFile($fileId);
            if ($userId === null) {
                return $this->responseBuilder->createNotFoundResponse('File not found');
            }

            // Read raw body — Nextcloud has already buffered it for us via php://input.
            $raw = file_get_contents('php://input');
            if ($raw === false || $raw === '') {
                return $this->responseBuilder->createBadRequestResponse('Empty request body');
            }

            if (strlen($raw) > AnnotationsService::MAX_PAYLOAD_BYTES) {
                return $this->responseBuilder->createBadRequestResponse('Annotation payload too large');
            }

            $decoded = json_decode($raw, true);
            if (!is_array($decoded)) {
                return $this->responseBuilder->createBadRequestResponse('Body is not valid JSON');
            }

            // Schema sanity check — match the client exporter format discriminator
            // so we never persist a foreign document into the annotations folder.
            if (!isset($decoded['format']) || $decoded['format'] !== 'threedviewer-annotations') {
                return $this->responseBuilder->createBadRequestResponse('Invalid format discriminator');
            }
            if (!isset($decoded['annotations']) || !is_array($decoded['annotations'])) {
                return $this->responseBuilder->createBadRequestResponse('Missing annotations array');
            }

            $ok = $this->annotationsService->save($fileId, $userId, $raw);
            if (!$ok) {
                return $this->responseBuilder->createErrorResponse(
                    'Failed to save annotations',
                    Http::STATUS_INTERNAL_SERVER_ERROR,
                );
            }

            return new JSONResponse([
                'success' => true,
                'fileId' => $fileId,
                'count' => count($decoded['annotations']),
            ]);
        } catch (\Throwable $e) {
            return $this->handleException($e);
        }
    }

    /**
     * Delete the saved annotation document for a model file.
     */
    #[NoAdminRequired]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'DELETE', url: '/api/annotations/{fileId}')]
    public function deleteAnnotations(int $fileId): JSONResponse
    {
        try {
            $fileId = $this->validateFileId($fileId);
            $userId = $this->requireAuthorisedUserForFile($fileId);
            if ($userId === null) {
                return $this->responseBuilder->createNotFoundResponse('File not found');
            }

            $ok = $this->annotationsService->delete($fileId, $userId);
            if (!$ok) {
                return $this->responseBuilder->createErrorResponse(
                    'Failed to delete annotations',
                    Http::STATUS_INTERNAL_SERVER_ERROR,
                );
            }

            return new JSONResponse(['success' => true]);
        } catch (\Throwable $e) {
            return $this->handleException($e);
        }
    }

    /**
     * Verify the current user is authenticated AND has access to the given
     * file ID. Returns the userId on success, or null if either check fails.
     * Logging happens here so each route handler stays small.
     */
    private function requireAuthorisedUserForFile(int $fileId): ?string
    {
        $user = $this->userSession->getUser();
        if ($user === null) {
            $this->logger->warning('AnnotationsController: User not authenticated', ['fileId' => $fileId]);

            return null;
        }
        $userId = $user->getUID();

        $userFolder = $this->rootFolder->getUserFolder($userId);
        $files = $userFolder->getById($fileId);
        if (empty($files)) {
            $this->logger->warning('AnnotationsController: File not accessible to user', [
                'fileId' => $fileId,
                'userId' => $userId,
            ]);

            return null;
        }

        return $userId;
    }
}
