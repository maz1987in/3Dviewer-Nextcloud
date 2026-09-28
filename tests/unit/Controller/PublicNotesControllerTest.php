<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Controller;

use OCA\ThreeDViewer\Controller\PublicNotesController;
use OCA\ThreeDViewer\Db\Note;
use OCA\ThreeDViewer\Service\NotesService;
use OCA\ThreeDViewer\Service\ShareFileService;
use OCP\AppFramework\PublicShareController;
use OCP\Files\File;
use OCP\Files\NotFoundException;
use OCP\IRequest;
use OCP\ISession;
use OCP\Share\IShare;
use PHPUnit\Framework\TestCase;

class PublicNotesControllerTest extends TestCase
{
    public function testExtendsPublicShareControllerSoTheMiddlewareEnforcesPasswords(): void
    {
        $this->assertInstanceOf(PublicShareController::class, $this->controller(null, $this->createMock(NotesService::class)));
    }

    public function testPasswordProtectedShareIsNotAuthenticatedWithoutSession(): void
    {
        $share = $this->createMock(IShare::class);
        $share->method('getPassword')->willReturn('hash');
        $share->method('getId')->willReturn('42');

        $controller = $this->controller($share, $this->createMock(NotesService::class));
        $controller->setToken('tok');

        $this->assertTrue($controller->isValidToken());
        $this->assertFalse($controller->isAuthenticated());
    }

    public function testListsTheSharedFilesNotesWithoutAuthors(): void
    {
        $file = $this->createMock(File::class);
        $file->method('getId')->willReturn(7);
        $notes = $this->createMock(NotesService::class);
        $note = new Note();
        $note->setId(3);
        $notes->method('list')->with(7)->willReturn([$note]);
        $notes->expects($this->once())->method('serialize')->with($note, false)->willReturn(['id' => 3, 'author' => null]);

        $response = $this->controller($this->createMock(IShare::class), $notes, $file)->index('tok', 7);

        $this->assertSame(200, $response->getStatus());
        $this->assertSame(['canEdit' => false, 'notes' => [['id' => 3, 'author' => null]]], $response->getData());
    }

    public function testAFileOutsideTheShareIs404(): void
    {
        $response = $this->controller($this->createMock(IShare::class), $this->createMock(NotesService::class), null)->index('tok', 7);

        $this->assertSame(404, $response->getStatus());
    }

    private function controller(?IShare $share, NotesService $notes, ?File $file = null): PublicNotesController
    {
        $shares = $this->createMock(ShareFileService::class);
        $shares->method('findValidLinkShare')->willReturn($share);
        if ($file === null) {
            $shares->method('getFileFromShare')->willThrowException(new NotFoundException());
        } else {
            $shares->method('getFileFromShare')->willReturn($file);
        }

        // The session holds no share-password proof, as for a visitor who never typed it.
        // Same stub as PublicFileControllerAuthTest.
        $session = $this->createMock(ISession::class);
        $session->method('get')->willReturn('[]');

        return new PublicNotesController('threedviewer', $this->createMock(IRequest::class), $session, $shares, $notes);
    }
}
