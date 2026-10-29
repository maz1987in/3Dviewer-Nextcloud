<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Controller;

use OCA\ThreeDViewer\Controller\PublicEmbedController;
use OCA\ThreeDViewer\Service\EmbedService;
use OCA\ThreeDViewer\Service\EmbedTarget;
use OCP\AppFramework\PublicShareController;
use OCP\Files\File;
use OCP\IRequest;
use OCP\ISession;
use OCP\IURLGenerator;
use OCP\Share\IShare;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class PublicEmbedControllerTest extends TestCase
{
    private EmbedService&MockObject $embed;

    protected function setUp(): void
    {
        $this->embed = $this->createMock(EmbedService::class);
    }

    public function testIsAPublicShareController(): void
    {
        $this->assertTrue(is_subclass_of(PublicEmbedController::class, PublicShareController::class), 'the middleware checks the share, and throttles bad tokens, only for these');
    }

    public function testDescribesAnEmbeddableShare(): void
    {
        $this->embed->method('embeddable')->with('tok')->willReturn($this->target(canDownload: true));
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
        $this->embed->method('embeddable')->willReturn($this->target(canDownload: false));
        $controller = $this->controller();
        $controller->isValidToken();

        $this->assertNull($controller->show('tok')->getData()['downloadUrl']);
    }

    public function testATokenThatIsNotEmbeddableIsInvalid(): void
    {
        $this->embed->method('embeddable')->willReturn(null);

        $this->assertFalse($this->controller()->isValidToken());
    }

    public function testTheShareIsLookedUpOnce(): void
    {
        $this->embed->expects($this->once())->method('embeddable')->willReturn($this->target(canDownload: true));
        $controller = $this->controller();

        $controller->isValidToken();
        $controller->show('tok');
    }

    public function testWithoutTheMiddlewareTheAnswerIsStillNotFound(): void
    {
        $this->embed->method('embeddable')->willReturn(null);

        $this->assertSame(404, $this->controller()->show('tok')->getStatus());
    }

    private function controller(): PublicEmbedController
    {
        $urls = $this->createMock(IURLGenerator::class);
        $urls->method('linkToRouteAbsolute')->willReturnCallback(static fn (string $route, array $params): string => match ($route) {
            'files_sharing.Share.showShare' => 'https://cloud.example/index.php/s/' . $params['token'],
            'files_sharing.Share.downloadShare' => 'https://cloud.example/index.php/s/' . $params['token'] . '/download',
            default => 'https://cloud.example/unexpected',
        });
        $controller = new PublicEmbedController('threedviewer', $this->createMock(IRequest::class), $this->createMock(ISession::class), $this->embed, $urls);
        $controller->setToken('tok');

        return $controller;
    }

    private function target(bool $canDownload): EmbedTarget
    {
        $file = $this->createMock(File::class);
        $file->method('getId')->willReturn(42);
        $file->method('getName')->willReturn('part.stl');
        $file->method('getMimetype')->willReturn('model/stl');

        return new EmbedTarget($this->createMock(IShare::class), $file, $canDownload);
    }
}
