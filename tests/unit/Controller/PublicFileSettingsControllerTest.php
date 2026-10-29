<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Controller;

use OCA\ThreeDViewer\Controller\PublicFileSettingsController;
use OCA\ThreeDViewer\Service\FileSettingsService;
use OCA\ThreeDViewer\Service\ShareFileService;
use OCP\AppFramework\PublicShareController;
use OCP\Files\File;
use OCP\Files\NotFoundException;
use OCP\IRequest;
use OCP\ISession;
use OCP\Share\IShare;
use PHPUnit\Framework\TestCase;

class PublicFileSettingsControllerTest extends TestCase
{
    public function testExtendsPublicShareControllerSoTheMiddlewareEnforcesPasswords(): void
    {
        $this->assertInstanceOf(PublicShareController::class, $this->controller(null, $this->createMock(FileSettingsService::class)));
    }

    public function testPasswordProtectedShareIsNotAuthenticatedWithoutSession(): void
    {
        $share = $this->createMock(IShare::class);
        $share->method('getPassword')->willReturn('hash');
        $share->method('getId')->willReturn('42');

        $controller = $this->controller($share, $this->createMock(FileSettingsService::class));
        $controller->setToken('tok');

        $this->assertTrue($controller->isValidToken());
        $this->assertFalse($controller->isAuthenticated());
    }

    /** The id in the URL (99) differs from the file the share resolves to (7). */
    public function testReadsTheUnitOfTheFileTheShareResolvesTo(): void
    {
        $file = $this->createMock(File::class);
        $file->method('getId')->willReturn(7);
        $settings = $this->createMock(FileSettingsService::class);
        $settings->expects($this->once())->method('unit')->with(7)->willReturn('in');

        $response = $this->controller($this->createMock(IShare::class), $settings, $file)->show('tok', 99);

        $this->assertSame(200, $response->getStatus());
        $this->assertSame(['canEdit' => false, 'unit' => 'in'], $response->getData());
    }

    public function testAFileOutsideTheShareIs404(): void
    {
        $response = $this->controller($this->createMock(IShare::class), $this->createMock(FileSettingsService::class), null)->show('tok', 7);

        $this->assertSame(404, $response->getStatus());
    }

    private function controller(?IShare $share, FileSettingsService $settings, ?File $file = null): PublicFileSettingsController
    {
        $shares = $this->createMock(ShareFileService::class);
        $shares->method('findValidLinkShare')->willReturn($share);
        if ($file === null) {
            $shares->method('getFileFromShare')->willThrowException(new NotFoundException());
        } else {
            $shares->method('getFileFromShare')->willReturn($file);
        }

        // The session holds no share-password proof, as for a visitor who never typed it
        $session = $this->createMock(ISession::class);
        $session->method('get')->willReturn('[]');

        return new PublicFileSettingsController('threedviewer', $this->createMock(IRequest::class), $session, $shares, $settings);
    }
}
