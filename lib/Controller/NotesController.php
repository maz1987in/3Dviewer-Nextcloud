<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCA\ThreeDViewer\Service\Exception\InvalidNoteException;
use OCA\ThreeDViewer\Service\Exception\NoteLimitException;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\NoteAccess;
use OCA\ThreeDViewer\Service\NoteAccessResult;
use OCA\ThreeDViewer\Service\NotesService;
use OCA\ThreeDViewer\Service\ResponseBuilder;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\ICacheFactory;
use OCP\IRequest;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;

/**
 * The shared annotations and measurements of a model, for signed-in users.
 *
 * No route carries NoCSRFRequired — the read included, because it runs the legacy
 * migration, and that publishes a user's private annotations to everyone who can open
 * the model.
 */
class NotesController extends BaseController
{
    public function __construct(
        string $appName,
        IRequest $request,
        private readonly IUserSession $userSession,
        private readonly NoteAccess $access,
        private readonly NotesService $notes,
        ResponseBuilder $responseBuilder,
        ModelFileSupport $modelFileSupport,
        LoggerInterface $logger,
        ICacheFactory $cacheFactory,
    ) {
        parent::__construct($appName, $request, $responseBuilder, $modelFileSupport, $logger, $cacheFactory);
    }

    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/notes/{fileId}')]
    public function index(int $fileId): JSONResponse
    {
        [$uid, $access] = $this->resolve($fileId);
        if ($access === null) {
            return $this->notFound();
        }

        $private = $this->notes->migrateLegacy($fileId, $uid, $access->canEdit);

        return new JSONResponse([
            'canEdit' => $access->canEdit,
            'notes' => array_map(fn ($note) => $this->notes->serialize($note, true), $this->notes->list($fileId)),
            'private' => $private,
        ]);
    }

    /**
     * @param mixed $payload decoded JSON body field, validated by NotesService
     */
    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'POST', url: '/api/notes/{fileId}')]
    public function create(int $fileId, string $type = '', mixed $payload = null): JSONResponse
    {
        [$uid, $access] = $this->resolve($fileId);
        if ($access === null) {
            return $this->notFound();
        }
        if (!$access->canEdit) {
            return $this->forbidden();
        }

        try {
            $note = $this->notes->create($fileId, $type, $payload, $uid);
        } catch (NoteLimitException $e) {
            return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_CONFLICT);
        } catch (InvalidNoteException $e) {
            return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
        }

        return new JSONResponse($this->notes->serialize($note, true), Http::STATUS_CREATED);
    }

    /**
     * @param mixed $payload decoded JSON body field, validated by NotesService
     */
    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'PATCH', url: '/api/notes/{fileId}/{noteId}')]
    public function update(int $fileId, int $noteId, mixed $payload = null): JSONResponse
    {
        [, $access] = $this->resolve($fileId);
        if ($access === null) {
            return $this->notFound();
        }
        if (!$access->canEdit) {
            return $this->forbidden();
        }

        try {
            $note = $this->notes->update($fileId, $noteId, $payload);
        } catch (DoesNotExistException) {
            return $this->notFound();
        } catch (InvalidNoteException $e) {
            return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
        }

        return new JSONResponse($this->notes->serialize($note, true));
    }

    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'DELETE', url: '/api/notes/{fileId}/{noteId}')]
    public function destroy(int $fileId, int $noteId): JSONResponse
    {
        [, $access] = $this->resolve($fileId);
        if ($access === null) {
            return $this->notFound();
        }
        if (!$access->canEdit) {
            return $this->forbidden();
        }

        try {
            $this->notes->delete($fileId, $noteId);
        } catch (DoesNotExistException) {
            return $this->notFound();
        }

        return new JSONResponse(null, Http::STATUS_NO_CONTENT);
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

    private function forbidden(): JSONResponse
    {
        return new JSONResponse(['error' => 'This model is view-only for you'], Http::STATUS_FORBIDDEN);
    }
}
