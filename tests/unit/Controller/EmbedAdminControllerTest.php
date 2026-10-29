<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Controller;

use OCA\ThreeDViewer\Controller\EmbedAdminController;
use OCA\ThreeDViewer\Service\EmbedOrigins;
use OCA\ThreeDViewer\Service\Exception\InvalidEmbedOriginException;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\IRequest;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class EmbedAdminControllerTest extends TestCase
{
    private EmbedOrigins&MockObject $origins;
    private EmbedAdminController $controller;

    protected function setUp(): void
    {
        $this->origins = $this->createMock(EmbedOrigins::class);
        $this->controller = new EmbedAdminController('threedviewer', $this->createMock(IRequest::class), $this->origins);
    }

    public function testTheRouteIsForAdminsOnly(): void
    {
        $method = new \ReflectionMethod(EmbedAdminController::class, 'update');

        $this->assertSame([], $method->getAttributes(NoAdminRequired::class), 'only admins list the sites');
        $this->assertSame([], $method->getAttributes(NoCSRFRequired::class), 'saving needs the request token');
        $this->assertSame([], $method->getAttributes(PublicPage::class));
    }

    public function testSavesAndReturnsTheList(): void
    {
        $this->origins->expects($this->once())->method('save')->with(['https://A.example/'])->willReturn(['https://a.example']);

        $response = $this->controller->update(['https://A.example/']);

        $this->assertSame(200, $response->getStatus());
        $this->assertSame(['origins' => ['https://a.example']], $response->getData());
    }

    public function testABadEntryIs400WithTheEntries(): void
    {
        $this->origins->method('save')->willThrowException(new InvalidEmbedOriginException(['http://shop.example.com']));

        $response = $this->controller->update(['http://shop.example.com']);

        $this->assertSame(400, $response->getStatus());
        $this->assertSame(['error' => 'Not a site address', 'invalid' => ['http://shop.example.com']], $response->getData());
    }
}
