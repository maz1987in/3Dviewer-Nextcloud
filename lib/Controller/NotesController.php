<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCA\ThreeDViewer\Service\Exception\InvalidNoteException;
use OCA\ThreeDViewer\Service\Exception\NoteLimitException;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\NoteAccess;
use OCA\ThreeDViewer\Service\NoteAccessResult;
use OCA\ThreeDViewer\Service\NoteActor;
use OCA\ThreeDViewer\Service\NoteChangePublisher;
use OCA\ThreeDViewer\Service\NotePayload;
use OCA\ThreeDViewer\Service\NotePeople;
use OCA\ThreeDViewer\Service\NotesService;
use OCA\ThreeDViewer\Service\ResponseBuilder;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\Response;
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
 *
 * Review follows the rule the notes themselves do: whoever may add a note to the model
 * may resolve it, reopen it, reply to it, and edit or delete any reply under it. The
 * rights are the model's, read from the file on every request; a note or a reply has none
 * of its own.
 *
 * @psalm-suppress UnusedClass Routed via attribute registration in Nextcloud runtime.
 */
class NotesController extends BaseController
{
    public function __construct(
        string $appName,
        IRequest $request,
        private readonly IUserSession $userSession,
        private readonly NoteAccess $access,
        private readonly NotesService $notes,
        private readonly NoteChangePublisher $changes,
        private readonly NotePeople $people,
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
            'notes' => $this->notes->serializeAll($fileId, true),
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

        $this->changes->added($access->file, $note, NoteActor::user($uid));

        return new JSONResponse($this->notes->serialize($note, true), Http::STATUS_CREATED);
    }

    /**
     * @param mixed $payload decoded JSON body field, validated by NotesService
     */
    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'PATCH', url: '/api/notes/{fileId}/{noteId}')]
    public function update(int $fileId, int $noteId, mixed $payload = null): JSONResponse
    {
        [$uid, $access] = $this->resolve($fileId);
        if ($access === null) {
            return $this->notFound();
        }
        if (!$access->canEdit) {
            return $this->forbidden();
        }

        try {
            $before = $this->notes->find($fileId, $noteId);
            $previousUpdatedAt = $before->getUpdatedAt();
            $previousText = NotePayload::textOf($before->getPayload());
            $note = $this->notes->update($fileId, $noteId, $payload);
        } catch (DoesNotExistException) {
            return $this->notFound();
        } catch (InvalidNoteException $e) {
            return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
        }

        $this->changes->changed($access->file, $note, NoteActor::user($uid), $previousUpdatedAt, $previousText);

        return new JSONResponse($this->notes->serializeWithThread($note, true));
    }

    /**
     * Resolve a note or open it again. Doing either to a note already in that state is
     * answered like a change, with the note as it is, and announces nothing.
     */
    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'PATCH', url: '/api/notes/{fileId}/{noteId}/state')]
    public function setState(int $fileId, int $noteId, string $state = ''): JSONResponse
    {
        [$uid, $access] = $this->resolve($fileId);
        if ($access === null) {
            return $this->notFound();
        }
        if (!$access->canEdit) {
            return $this->forbidden();
        }

        try {
            [$note, $changed] = $this->notes->changeState($fileId, $noteId, $state, $uid);
        } catch (DoesNotExistException) {
            return $this->notFound();
        } catch (InvalidNoteException $e) {
            return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
        }

        if ($changed) {
            $this->changes->stateChanged($access->file, $note, NoteActor::user($uid));
        }

        return new JSONResponse($this->notes->serializeWithThread($note, true));
    }

    /**
     * Add a reply to a note. A reply to a resolved note is allowed and leaves it resolved:
     * answering "done" or "thanks" is not a reason to put the note back on someone's list.
     * Reopening is its own, deliberate action.
     */
    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'POST', url: '/api/notes/{fileId}/{noteId}/replies')]
    public function reply(int $fileId, int $noteId, mixed $text = null): JSONResponse
    {
        [$uid, $access] = $this->resolve($fileId);
        if ($access === null) {
            return $this->notFound();
        }
        if (!$access->canEdit) {
            return $this->forbidden();
        }

        try {
            $note = $this->notes->find($fileId, $noteId);
            $reply = $this->notes->addReply($fileId, $noteId, $text, $uid);
        } catch (DoesNotExistException) {
            return $this->notFound();
        } catch (NoteLimitException $e) {
            return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_CONFLICT);
        } catch (InvalidNoteException $e) {
            return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
        }

        $this->changes->replied($access->file, $note, $reply, NoteActor::user($uid));

        return new JSONResponse($this->notes->serializeReply($reply, true), Http::STATUS_CREATED);
    }

    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'PATCH', url: '/api/notes/{fileId}/{noteId}/replies/{replyId}')]
    public function updateReply(int $fileId, int $noteId, int $replyId, mixed $text = null): JSONResponse
    {
        [$uid, $access] = $this->resolve($fileId);
        if ($access === null) {
            return $this->notFound();
        }
        if (!$access->canEdit) {
            return $this->forbidden();
        }

        try {
            $note = $this->notes->find($fileId, $noteId);
            $previousText = $this->notes->findReply($fileId, $noteId, $replyId)->getText();
            $reply = $this->notes->updateReply($fileId, $noteId, $replyId, $text);
        } catch (DoesNotExistException) {
            return $this->notFound();
        } catch (InvalidNoteException $e) {
            return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
        }

        $this->changes->replyChanged($access->file, $note, $reply, NoteActor::user($uid), $previousText);

        return new JSONResponse($this->notes->serializeReply($reply, true));
    }

    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'DELETE', url: '/api/notes/{fileId}/{noteId}/replies/{replyId}')]
    public function destroyReply(int $fileId, int $noteId, int $replyId): Response
    {
        [, $access] = $this->resolve($fileId);
        if ($access === null) {
            return $this->notFound();
        }
        if (!$access->canEdit) {
            return $this->forbidden();
        }

        try {
            $this->notes->deleteReply($fileId, $noteId, $replyId);
        } catch (DoesNotExistException) {
            return $this->notFound();
        }

        $response = new Response();
        $response->setStatus(Http::STATUS_NO_CONTENT);

        return $response;
    }

    /**
     * The people to offer when someone types an @: those who can open this model.
     * Only someone who can write a note needs them, so a view-only user has none.
     */
    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/notes/{fileId}/people')]
    public function mentionable(int $fileId, string $search = ''): JSONResponse
    {
        [$uid, $access] = $this->resolve($fileId);
        if ($access === null) {
            return $this->notFound();
        }
        if (!$access->canEdit) {
            return $this->forbidden();
        }

        return new JSONResponse(['people' => $this->people->search($fileId, $uid, $search)]);
    }

    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'DELETE', url: '/api/notes/{fileId}/{noteId}')]
    public function destroy(int $fileId, int $noteId): Response
    {
        [$uid, $access] = $this->resolve($fileId);
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
        $this->changes->deleted($access->file, $noteId, NoteActor::user($uid));

        // A plain Response: a JSONResponse would send the body `null` with a 204.
        $response = new Response();
        $response->setStatus(Http::STATUS_NO_CONTENT);

        return $response;
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
