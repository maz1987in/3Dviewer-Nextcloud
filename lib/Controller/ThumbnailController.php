<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCA\ThreeDViewer\Constants\SupportedFormats;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\NoteAccess;
use OCA\ThreeDViewer\Service\ResponseBuilder;
use OCA\ThreeDViewer\Service\ThumbnailService;
use OCA\ThreeDViewer\Service\ThumbnailStoreResult;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\ICacheFactory;
use OCP\IRequest;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;

/**
 * Stores the thumbnails the browser renders for 3D models, and reports which models have one.
 *
 * A thumbnail is stored once per file version and shown to everyone who can read the file,
 * so this controller is the only gate on who may write one: it requires the CSRF token and
 * update rights on the file, and it only ever stores under the server's own ETag.
 *
 * @psalm-suppress MissingDependency Nextcloud runtime provides dependent classes in full environment.
 */
class ThumbnailController extends BaseController
{
    private const MAX_STATUS_IDS = 200;

    private IRootFolder $rootFolder;
    private IUserSession $userSession;
    private ThumbnailService $thumbnailService;
    private NoteAccess $noteAccess;

    public function __construct(
        string $appName,
        IRequest $request,
        IRootFolder $rootFolder,
        IUserSession $userSession,
        ThumbnailService $thumbnailService,
        NoteAccess $noteAccess,
        ResponseBuilder $responseBuilder,
        ModelFileSupport $modelFileSupport,
        LoggerInterface $logger,
        ICacheFactory $cacheFactory
    ) {
        parent::__construct($appName, $request, $responseBuilder, $modelFileSupport, $logger, $cacheFactory);
        $this->rootFolder = $rootFolder;
        $this->userSession = $userSession;
        $this->thumbnailService = $thumbnailService;
        $this->noteAccess = $noteAccess;
    }

    /**
     * Store the thumbnail for the current version of a model.
     *
     * The body is the raw PNG. `etag` names the version the browser rendered; it is only
     * compared with the file's current ETag, never used as the storage key.
     *
     * @param int $fileId The file to store a thumbnail for
     * @param string $etag The ETag of the version the thumbnail was rendered from
     */
    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'POST', url: '/api/thumbnail/{fileId}')]
    public function storeThumbnail(int $fileId, string $etag = ''): JSONResponse
    {
        $user = $this->userSession->getUser();
        if ($user === null) {
            return $this->responseBuilder->createUnauthorizedResponse('User not authenticated');
        }
        $uid = $user->getUID();

        if ($etag === '') {
            return $this->responseBuilder->createBadRequestResponse('The etag parameter is required');
        }

        try {
            $file = $this->findThumbnailableFile($fileId, $uid);
            $access = $file === null ? null : $this->noteAccess->forUser($fileId, $uid);
            if ($file === null || $access === null) {
                return $this->responseBuilder->createNotFoundResponse('File not found');
            }

            if (!$access->canEdit) {
                return $this->responseBuilder->createErrorResponse('You cannot update this file', Http::STATUS_FORBIDDEN);
            }

            // The version is whatever the server says it is now; a client that rendered an
            // older one must not have its image filed under the newer ETag.
            $currentEtag = $file->getEtag();
            if (!hash_equals($currentEtag, $etag)) {
                return new JSONResponse(['status' => 'stale'], Http::STATUS_PRECONDITION_FAILED);
            }

            $declaredLength = (int) $this->request->getHeader('Content-Length');
            if ($declaredLength > ThumbnailService::MAX_BYTES) {
                return $this->responseBuilder->createBadRequestResponse('Thumbnail too large');
            }

            $result = $this->thumbnailService->store($fileId, $currentEtag, $this->readBody());
        } catch (\Throwable $e) {
            $this->logger->error('ThumbnailController: Failed to store thumbnail', [
                'fileId' => $fileId,
                'exception' => $e,
            ]);

            return $this->responseBuilder->createErrorResponse('Failed to store thumbnail', Http::STATUS_INTERNAL_SERVER_ERROR);
        }

        return match ($result) {
            ThumbnailStoreResult::Stored => new JSONResponse(['status' => 'stored'], Http::STATUS_CREATED),
            ThumbnailStoreResult::Exists => new JSONResponse(['status' => 'exists'], Http::STATUS_CONFLICT),
            ThumbnailStoreResult::InvalidImage => $this->responseBuilder->createBadRequestResponse('The thumbnail is not an accepted PNG'),
        };
    }

    /**
     * Report, for up to 200 files, what the browser needs to thumbnail the ones that lack one.
     *
     * Files the user cannot read, folders and non-model files are left out, so the answer
     * says nothing about whether such an id exists.
     *
     * @param string $ids Comma-separated file ids
     */
    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/thumbnails/status')]
    public function status(string $ids = ''): JSONResponse
    {
        $user = $this->userSession->getUser();
        if ($user === null) {
            return $this->responseBuilder->createUnauthorizedResponse('User not authenticated');
        }
        $uid = $user->getUID();

        $parsed = $this->parseIds($ids);
        if ($parsed === null) {
            return $this->responseBuilder->createBadRequestResponse(
                'ids must be 1 to ' . self::MAX_STATUS_IDS . ' comma-separated positive integers'
            );
        }

        $files = [];
        foreach ($parsed as $id) {
            try {
                $file = $this->findThumbnailableFile($id, $uid);
                $access = $file === null ? null : $this->noteAccess->forUser($id, $uid);
                if ($file === null || $access === null) {
                    continue;
                }

                $etag = $file->getEtag();
                $files[$id] = [
                    'name' => $file->getName(),
                    'dir' => $this->directoryOf($file, $uid),
                    'size' => (int) $file->getSize(),
                    'etag' => $etag,
                    'canEdit' => $access->canEdit,
                    'hasThumbnail' => $this->thumbnailService->has($id, $etag),
                ];
            } catch (\Throwable $e) {
                // One bad file must not hide the thumbnails of the others.
                $this->logger->warning('ThumbnailController: Skipped a file in the status check', [
                    'fileId' => $id,
                    'exception' => $e,
                ]);
            }
        }

        // An empty PHP array would encode as `[]`; the client reads this as a map.
        return new JSONResponse(['files' => (object) $files]);
    }

    /**
     * The raw request body, read no further than one byte past the cap.
     */
    protected function readBody(): string
    {
        $stream = fopen('php://input', 'rb');
        if ($stream === false) {
            return '';
        }

        try {
            return (string) stream_get_contents($stream, ThumbnailService::MAX_BYTES + 1);
        } finally {
            fclose($stream);
        }
    }

    /**
     * The file behind an id in the user's home, if it is a file of a thumbnailable type.
     */
    private function findThumbnailableFile(int $fileId, string $uid): ?File
    {
        if ($fileId <= 0) {
            return null;
        }

        foreach ($this->rootFolder->getUserFolder($uid)->getById($fileId) as $node) {
            if ($node instanceof File) {
                $extension = strtolower($node->getExtension());

                return in_array($extension, SupportedFormats::getThumbnailExtensions(), true) ? $node : null;
            }
        }

        return null;
    }

    /**
     * The file's parent folder relative to the user's home ("/" for the home itself).
     */
    private function directoryOf(File $file, string $uid): string
    {
        $home = $this->rootFolder->getUserFolder($uid);
        $relative = $home->getRelativePath($file->getPath()) ?? '/' . $file->getName();

        return dirname($relative);
    }

    /**
     * @return list<int>|null Null when the list is empty, too long, or has an id that is not a positive integer
     */
    private function parseIds(string $ids): ?array
    {
        $parts = explode(',', $ids);
        if (count($parts) > self::MAX_STATUS_IDS) {
            return null;
        }

        $parsed = [];
        foreach ($parts as $part) {
            // Up to 18 digits always fits in a 64-bit int.
            if (preg_match('/^[1-9][0-9]{0,17}$/', trim($part)) !== 1) {
                return null;
            }
            $parsed[] = (int) $part;
        }

        return array_values(array_unique($parsed));
    }
}
