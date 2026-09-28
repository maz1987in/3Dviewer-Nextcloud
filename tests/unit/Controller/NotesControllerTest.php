<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Controller;

use OCA\ThreeDViewer\Controller\NotesController;
use OCA\ThreeDViewer\Db\Note;
use OCA\ThreeDViewer\Service\Exception\InvalidNoteException;
use OCA\ThreeDViewer\Service\Exception\NoteLimitException;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\NoteAccess;
use OCA\ThreeDViewer\Service\NoteAccessResult;
use OCA\ThreeDViewer\Service\NotesService;
use OCA\ThreeDViewer\Service\ResponseBuilder;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\ICache;
use OCP\ICacheFactory;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserSession;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class NotesControllerTest extends TestCase
{
    private NoteAccess&MockObject $access;
    private NotesService&MockObject $notes;
    private NotesController $controller;

    protected function setUp(): void
    {
        $this->access = $this->createMock(NoteAccess::class);
        $this->notes = $this->createMock(NotesService::class);
        $this->notes->method('serialize')->willReturnCallback(fn (Note $n) => ['id' => $n->getId()]);

        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('alice');
        $session = $this->createMock(IUserSession::class);
        $session->method('getUser')->willReturn($user);

        $cacheFactory = $this->createMock(ICacheFactory::class);
        $cacheFactory->method('createDistributed')->willReturn($this->createMock(ICache::class));

        $this->controller = new NotesController(
            'threedviewer',
            $this->createMock(IRequest::class),
            $session,
            $this->access,
            $this->notes,
            new ResponseBuilder($this->createMock(ModelFileSupport::class)),
            $this->createMock(ModelFileSupport::class),
            $this->createMock(LoggerInterface::class),
            $cacheFactory,
        );
    }

    /**
     * Every route, reads included: the read runs the legacy migration, which publishes
     * private annotations, so a forged cross-site request must not reach it.
     */
    public function testNoRouteOptsOutOfCsrf(): void
    {
        foreach ((new \ReflectionClass(NotesController::class))->getMethods(\ReflectionMethod::IS_PUBLIC) as $method) {
            $this->assertSame([], $method->getAttributes(NoCSRFRequired::class), $method->getName() . ' must require the CSRF token');
        }
    }

    public function testInaccessibleFileIs404ForEveryRoute(): void
    {
        $this->access->method('forUser')->willReturn(null);

        $this->assertSame(404, $this->controller->index(7)->getStatus());
        $this->assertSame(404, $this->controller->create(7, 'annotation', [])->getStatus());
        $this->assertSame(404, $this->controller->update(7, 1, [])->getStatus());
        $this->assertSame(404, $this->controller->destroy(7, 1)->getStatus());
    }

    public function testIndexReturnsNotesEditRightAndPrivateNotes(): void
    {
        $this->access->method('forUser')->willReturn(new NoteAccessResult(false));
        $this->notes->expects($this->once())->method('migrateLegacy')->with(7, 'alice', false)->willReturn([['id' => 'private-0']]);
        $this->notes->method('list')->willReturn([$this->note(3)]);

        $response = $this->controller->index(7);

        $this->assertSame(200, $response->getStatus());
        $this->assertSame(['canEdit' => false, 'notes' => [['id' => 3]], 'private' => [['id' => 'private-0']]], $response->getData());
    }

    public function testReadOnlyUsersCannotWrite(): void
    {
        $this->access->method('forUser')->willReturn(new NoteAccessResult(false));
        $this->notes->expects($this->never())->method('create');
        $this->notes->expects($this->never())->method('update');
        $this->notes->expects($this->never())->method('delete');

        $this->assertSame(403, $this->controller->create(7, 'annotation', [])->getStatus());
        $this->assertSame(403, $this->controller->update(7, 1, [])->getStatus());
        $this->assertSame(403, $this->controller->destroy(7, 1)->getStatus());
    }

    public function testCreateReturns201(): void
    {
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true));
        $this->notes->method('create')->with(7, 'annotation', ['p'], 'alice')->willReturn($this->note(4));

        $response = $this->controller->create(7, 'annotation', ['p']);

        $this->assertSame(201, $response->getStatus());
        $this->assertSame(['id' => 4], $response->getData());
    }

    public function testInvalidPayloadIs400AndLimitIs409(): void
    {
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true));
        $this->notes->method('create')->willReturnOnConsecutiveCalls(
            $this->throwException(new InvalidNoteException('Bad')),
            $this->throwException(new NoteLimitException('Full')),
        );

        $this->assertSame(400, $this->controller->create(7, 'annotation', [])->getStatus());
        $this->assertSame(409, $this->controller->create(7, 'annotation', [])->getStatus());
    }

    public function testMissingNoteIs404(): void
    {
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true));
        $this->notes->method('update')->willThrowException(new DoesNotExistException(''));
        $this->notes->method('delete')->willThrowException(new DoesNotExistException(''));

        $this->assertSame(404, $this->controller->update(7, 1, [])->getStatus());
        $this->assertSame(404, $this->controller->destroy(7, 1)->getStatus());
    }

    public function testDeleteReturns204(): void
    {
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true));
        $this->notes->expects($this->once())->method('delete')->with(7, 1);

        $response = $this->controller->destroy(7, 1);

        $this->assertSame(204, $response->getStatus());
        $this->assertNotInstanceOf(JSONResponse::class, $response, 'a 204 carries no body, not the JSON `null`');
        $this->assertSame('', $response->render());
    }

    private function note(int $id): Note
    {
        $note = new Note();
        $note->setId($id);

        return $note;
    }
}
