<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Controller;

use OCA\ThreeDViewer\Controller\NotesController;
use OCA\ThreeDViewer\Db\Note;
use OCA\ThreeDViewer\Db\NoteReply;
use OCA\ThreeDViewer\Service\Exception\InvalidNoteException;
use OCA\ThreeDViewer\Service\Exception\NoteLimitException;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\NoteAccess;
use OCA\ThreeDViewer\Service\NoteAccessResult;
use OCA\ThreeDViewer\Service\NoteActor;
use OCA\ThreeDViewer\Service\NoteChangePublisher;
use OCA\ThreeDViewer\Service\NotePeople;
use OCA\ThreeDViewer\Service\NotesService;
use OCA\ThreeDViewer\Service\ResponseBuilder;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\Files\File;
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
    private NoteChangePublisher&MockObject $changes;
    private NotePeople&MockObject $people;
    private NotesController $controller;

    protected function setUp(): void
    {
        $this->access = $this->createMock(NoteAccess::class);
        $this->notes = $this->createMock(NotesService::class);
        $this->changes = $this->createMock(NoteChangePublisher::class);
        $this->people = $this->createMock(NotePeople::class);
        $this->notes->method('serialize')->willReturnCallback(fn (Note $n) => ['id' => $n->getId()]);
        $this->notes->method('serializeWithThread')->willReturnCallback(fn (Note $n) => ['id' => $n->getId(), 'replies' => []]);
        $this->notes->method('serializeReply')->willReturnCallback(fn (NoteReply $r) => ['id' => $r->getId()]);

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
            $this->changes,
            $this->people,
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
        $this->assertSame(404, $this->controller->setState(7, 1, 'resolved')->getStatus());
        $this->assertSame(404, $this->controller->reply(7, 1, 'Hi')->getStatus());
        $this->assertSame(404, $this->controller->updateReply(7, 1, 2, 'Hi')->getStatus());
        $this->assertSame(404, $this->controller->destroyReply(7, 1, 2)->getStatus());
        $this->assertSame(404, $this->controller->mentionable(7, 'a')->getStatus());
    }

    public function testIndexReturnsNotesEditRightAndPrivateNotes(): void
    {
        $this->access->method('forUser')->willReturn(new NoteAccessResult(false));
        $this->notes->expects($this->once())->method('migrateLegacy')->with(7, 'alice', false)->willReturn([['id' => 'private-0']]);
        $this->notes->method('serializeAll')->with(7, true)->willReturn([['id' => 3]]);

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
        $this->notes->expects($this->never())->method('changeState');
        $this->notes->expects($this->never())->method('addReply');
        $this->notes->expects($this->never())->method('updateReply');
        $this->notes->expects($this->never())->method('deleteReply');
        $this->people->expects($this->never())->method('search');

        $this->assertSame(403, $this->controller->create(7, 'annotation', [])->getStatus());
        $this->assertSame(403, $this->controller->update(7, 1, [])->getStatus());
        $this->assertSame(403, $this->controller->destroy(7, 1)->getStatus());
        // Review is for those who may add notes: a viewer can neither resolve, nor reply, nor look up people
        $this->assertSame(403, $this->controller->setState(7, 1, 'resolved')->getStatus());
        $this->assertSame(403, $this->controller->reply(7, 1, 'Hi')->getStatus());
        $this->assertSame(403, $this->controller->updateReply(7, 1, 2, 'Hi')->getStatus());
        $this->assertSame(403, $this->controller->destroyReply(7, 1, 2)->getStatus());
        $this->assertSame(403, $this->controller->mentionable(7, 'a')->getStatus());
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

    public function testANewNoteIsAnnouncedAsTheSignedInUsersWithTheFileTheyOpenedIt(): void
    {
        $file = $this->createMock(File::class);
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true, 'a.stl', $file));
        $note = $this->note(4);
        $this->notes->method('create')->willReturn($note);
        $this->changes->expects($this->once())->method('added')
            ->with($file, $note, $this->callback(fn (NoteActor $actor) => $actor->isUser() && $actor->value === 'alice'));

        $this->controller->create(7, 'annotation', ['p']);
    }

    public function testAnEditIsAnnouncedWithWhenTheNoteWasLastTouched(): void
    {
        $file = $this->createMock(File::class);
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true, 'a.stl', $file));
        $before = $this->note(4);
        $before->setUpdatedAt(1_000);
        $after = $this->note(4);
        $this->notes->method('find')->willReturn($before);
        $this->notes->method('update')->willReturn($after);
        $this->changes->expects($this->once())->method('changed')
            ->with($file, $after, $this->callback(fn (NoteActor $actor) => $actor->value === 'alice'), 1_000, '');

        $this->controller->update(7, 4, ['p']);
    }

    public function testADeletionIsAnnounced(): void
    {
        $file = $this->createMock(File::class);
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true, 'a.stl', $file));
        $this->changes->expects($this->once())->method('deleted')
            ->with($file, 4, $this->callback(fn (NoteActor $actor) => $actor->value === 'alice'));

        $this->controller->destroy(7, 4);
    }

    /** Nothing is announced for a change that was refused or never made. */
    public function testNothingIsAnnouncedForARefusedOrFailedChange(): void
    {
        $this->changes->expects($this->never())->method('added');
        $this->changes->expects($this->never())->method('changed');
        $this->changes->expects($this->never())->method('deleted');

        $this->access->method('forUser')->willReturnOnConsecutiveCalls(
            null,
            null,
            null,
            new NoteAccessResult(false),
            new NoteAccessResult(false),
            new NoteAccessResult(false),
            new NoteAccessResult(true),
            new NoteAccessResult(true),
            new NoteAccessResult(true),
        );
        $this->notes->method('create')->willThrowException(new InvalidNoteException('Bad'));
        $this->notes->method('find')->willThrowException(new DoesNotExistException(''));
        $this->notes->method('delete')->willThrowException(new DoesNotExistException(''));

        $this->controller->create(7, 'annotation', []);
        $this->controller->update(7, 1, []);
        $this->controller->destroy(7, 1);
        $this->controller->create(7, 'annotation', []);
        $this->controller->update(7, 1, []);
        $this->controller->destroy(7, 1);
        $this->controller->create(7, 'annotation', []);
        $this->controller->update(7, 1, []);
        $this->controller->destroy(7, 1);
    }

    public function testResolvingAnnouncesOnceAndNotWhenNothingChanged(): void
    {
        $file = $this->createMock(File::class);
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true, 'a.stl', $file));
        $resolved = $this->note(4);
        $resolved->setState(Note::STATE_RESOLVED);
        $this->notes->method('changeState')->with(7, 4, 'resolved', 'alice')->willReturnOnConsecutiveCalls([$resolved, true], [$resolved, false]);
        $this->changes->expects($this->once())->method('stateChanged')
            ->with($file, $resolved, $this->callback(fn (NoteActor $actor) => $actor->value === 'alice'));

        $first = $this->controller->setState(7, 4, 'resolved');
        $second = $this->controller->setState(7, 4, 'resolved');

        $this->assertSame(200, $first->getStatus());
        $this->assertSame(200, $second->getStatus());
    }

    public function testAnUnknownStateIs400AndAMissingNoteIs404(): void
    {
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true));
        $this->notes->method('changeState')->willReturnOnConsecutiveCalls(
            $this->throwException(new InvalidNoteException('Unknown state')),
            $this->throwException(new DoesNotExistException('')),
        );
        $this->changes->expects($this->never())->method('stateChanged');

        $this->assertSame(400, $this->controller->setState(7, 4, 'archived')->getStatus());
        $this->assertSame(404, $this->controller->setState(7, 4, 'resolved')->getStatus());
    }

    public function testAReplyIsCreatedAndAnnouncedAsTheSignedInUsers(): void
    {
        $file = $this->createMock(File::class);
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true, 'a.stl', $file));
        $note = $this->note(4);
        $reply = new NoteReply();
        $reply->setId(9);
        $this->notes->method('find')->willReturn($note);
        $this->notes->method('addReply')->with(7, 4, 'Hi', 'alice')->willReturn($reply);
        $this->changes->expects($this->once())->method('replied')
            ->with($file, $note, $reply, $this->callback(fn (NoteActor $actor) => $actor->isUser() && $actor->value === 'alice'));

        $response = $this->controller->reply(7, 4, 'Hi');

        $this->assertSame(201, $response->getStatus());
        $this->assertSame(['id' => 9], $response->getData());
    }

    public function testRepliesRefuseBadTextAndFullThreadsAndMissingNotes(): void
    {
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true));
        $this->notes->method('find')->willReturn($this->note(4));
        $this->notes->method('addReply')->willReturnOnConsecutiveCalls(
            $this->throwException(new InvalidNoteException('A reply needs some text')),
            $this->throwException(new NoteLimitException('Full')),
            $this->throwException(new DoesNotExistException('')),
        );
        $this->changes->expects($this->never())->method('replied');

        $this->assertSame(400, $this->controller->reply(7, 4, '')->getStatus());
        $this->assertSame(409, $this->controller->reply(7, 4, 'Hi')->getStatus());
        $this->assertSame(404, $this->controller->reply(7, 4, 'Hi')->getStatus());
    }

    public function testEditingAReplyAnnouncesTheTextItHad(): void
    {
        $file = $this->createMock(File::class);
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true, 'a.stl', $file));
        $note = $this->note(4);
        $before = new NoteReply();
        $before->setText('Old');
        $after = new NoteReply();
        $after->setId(9);
        $after->setText('New');
        $this->notes->method('find')->willReturn($note);
        $this->notes->method('findReply')->with(7, 4, 9)->willReturn($before);
        $this->notes->method('updateReply')->with(7, 4, 9, 'New')->willReturn($after);
        $this->changes->expects($this->once())->method('replyChanged')
            ->with($file, $note, $after, $this->callback(fn (NoteActor $actor) => $actor->value === 'alice'), 'Old');

        $this->assertSame(200, $this->controller->updateReply(7, 4, 9, 'New')->getStatus());
    }

    public function testDeletingAReplyReturns204AndAMissingOneIs404(): void
    {
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true));
        $this->notes->method('deleteReply')->willReturnOnConsecutiveCalls(null, $this->throwException(new DoesNotExistException('')));

        $response = $this->controller->destroyReply(7, 4, 9);

        $this->assertSame(204, $response->getStatus());
        $this->assertSame('', $response->render());
        $this->assertSame(404, $this->controller->destroyReply(7, 4, 9)->getStatus());
    }

    public function testThePeopleSearchIsScopedToTheFileAndTheSearcher(): void
    {
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true));
        $this->people->expects($this->once())->method('search')->with(7, 'alice', 'bo')->willReturn([['id' => 'bob', 'label' => 'Bob']]);

        $response = $this->controller->mentionable(7, 'bo');

        $this->assertSame(200, $response->getStatus());
        $this->assertSame(['people' => [['id' => 'bob', 'label' => 'Bob']]], $response->getData());
    }

    private function note(int $id): Note
    {
        $note = new Note();
        $note->setId($id);

        return $note;
    }
}
