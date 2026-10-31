<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Controller;

use OCA\ThreeDViewer\Controller\PublicEmbedController;
use OCA\ThreeDViewer\Service\EmbedService;
use OCA\ThreeDViewer\Service\EmbedTarget;
use OCA\ThreeDViewer\Service\ShareFileService;
use OCP\AppFramework\PublicShareController;
use OCP\Files\File;
use OCP\Files\NotFoundException;
use OCP\IRequest;
use OCP\ISession;
use OCP\IURLGenerator;
use OCP\Share\IShare;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class PublicEmbedControllerTest extends TestCase
{
    private ShareFileService&MockObject $shares;
    private EmbedService&MockObject $embed;
    private IShare&MockObject $share;

    protected function setUp(): void
    {
        $this->shares = $this->createMock(ShareFileService::class);
        $this->embed = $this->createMock(EmbedService::class);
        $this->share = $this->createMock(IShare::class);
    }

    public function testIsAPublicShareController(): void
    {
        $this->assertTrue(is_subclass_of(PublicEmbedController::class, PublicShareController::class), 'the middleware checks the share, and throttles bad tokens, only for these');
    }

    public function testDescribesAnEmbeddableShare(): void
    {
        $this->shares->method('findValidLinkShare')->with('tok')->willReturn($this->share);
        $this->embed->method('embeddable')->with($this->share)->willReturn($this->target(canDownload: true));
        $controller = $this->controller();

        $this->assertTrue($controller->isValidToken());
        $response = $controller->show('tok');

        $this->assertSame(200, $response->getStatus());
        $this->assertSame([
            'fileId' => 42,
            'filename' => 'part.stl',
            'mime' => 'model/stl',
            'shareUrl' => 'https://cloud.example/index.php/s/tok',
            'downloadUrl' => 'https://cloud.example/index.php/s/tok/download',
        ], $response->getData());
    }

    public function testDownloadIsNullWhenTheShareHidesIt(): void
    {
        $this->shares->method('findValidLinkShare')->willReturn($this->share);
        $this->embed->method('embeddable')->willReturn($this->target(canDownload: false));
        $controller = $this->controller();
        $controller->isValidToken();

        $this->assertNull($controller->show('tok')->getData()['downloadUrl']);
    }

    public function testATokenWithNoShareIsInvalid(): void
    {
        $this->shares->method('findValidLinkShare')->willReturn(null);
        $this->embed->expects($this->never())->method('embeddable');

        $this->assertFalse($this->controller()->isValidToken());
    }

    /**
     * The middleware throttles an invalid token, and every embed for that address waits
     * on it: a share that exists, but may not be embedded, is refused by show() instead.
     */
    public function testAShareThatCannotBeEmbeddedIsAValidTokenThatShowRefuses(): void
    {
        $this->shares->method('findValidLinkShare')->willReturn($this->share);
        $this->embed->method('embeddable')->willReturn(null);
        $controller = $this->controller();

        $this->assertTrue($controller->isValidToken());
        $this->expectException(NotFoundException::class);
        $controller->show('tok');
    }

    public function testAPasswordProtectedShareIsNotAuthenticated(): void
    {
        $this->share->method('getPassword')->willReturn('$2y$hash');
        $this->shares->method('findValidLinkShare')->willReturn($this->share);
        $controller = $this->controller();
        $controller->isValidToken();

        $this->assertFalse($controller->isAuthenticated(), 'so the middleware refuses it before show() runs');
    }

    public function testTheShareIsLookedUpOnce(): void
    {
        $this->shares->expects($this->once())->method('findValidLinkShare')->willReturn($this->share);
        $this->embed->method('embeddable')->willReturn($this->target(canDownload: true));
        $controller = $this->controller();

        $controller->isValidToken();
        $controller->show('tok');
    }

    private function controller(): PublicEmbedController
    {
        $urls = $this->createMock(IURLGenerator::class);
        $urls->method('linkToRouteAbsolute')->willReturnCallback(static fn (string $route, array $params): string => match ($route) {
            'files_sharing.Share.showShare' => 'https://cloud.example/index.php/s/' . $params['token'],
            'files_sharing.Share.downloadShare' => 'https://cloud.example/index.php/s/' . $params['token'] . '/download',
            default => 'https://cloud.example/unexpected',
        });
        $controller = new PublicEmbedController('threedviewer', $this->createMock(IRequest::class), $this->createMock(ISession::class), $this->shares, $this->embed, $urls);
        $controller->setToken('tok');

        return $controller;
    }

    private function target(bool $canDownload): EmbedTarget
    {
        $file = $this->createMock(File::class);
        $file->method('getId')->willReturn(42);
        $file->method('getName')->willReturn('part.stl');
        $file->method('getMimetype')->willReturn('model/stl');

        return new EmbedTarget($file, $canDownload);
    }
}
