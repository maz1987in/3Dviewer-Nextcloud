<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Controller;

use OCA\ThreeDViewer\Controller\EmbedPageController;
use OCA\ThreeDViewer\Service\EmbedOrigins;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\ResponseBuilder;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\NoSameSiteCookieRequired;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IRequest;
use PHPUnit\Framework\TestCase;

class EmbedPageControllerTest extends TestCase
{
    public function testFramesOnlyForTheListedSites(): void
    {
        $response = $this->controller(['https://a.example', 'https://b.example'])->page();

        $this->assertSame(200, $response->getStatus());
        $this->assertSame('embed', $response->getTemplateName());
        $this->assertSame(TemplateResponse::RENDER_AS_BASE, $response->getRenderAs());
        $policy = $response->getContentSecurityPolicy()->buildPolicy();
        $this->assertStringContainsString("frame-ancestors 'self' https://a.example https://b.example", $policy);
        $this->assertStringContainsString('worker-src', $policy, 'the viewer\'s own CSP additions are there too');
    }

    public function testWithEmbeddingOffItIs404AndAddsNoAncestors(): void
    {
        $response = $this->controller([])->page();

        $this->assertSame(404, $response->getStatus());
        $this->assertStringContainsString("frame-ancestors 'self';", $response->getContentSecurityPolicy()->buildPolicy());
    }

    public function testTakesNoTokenAndNeedsNoSession(): void
    {
        $method = new \ReflectionMethod(EmbedPageController::class, 'page');

        $this->assertSame([], $method->getParameters(), 'the page reads no share, so it takes no token');
        $this->assertCount(1, $method->getAttributes(PublicPage::class));
        $this->assertCount(1, $method->getAttributes(NoCSRFRequired::class));
        $this->assertCount(1, $method->getAttributes(NoSameSiteCookieRequired::class), 'a frame on another site carries no same-site cookie');
        $this->assertMatchesRegularExpression('/^\s*\*\s*@NoSameSiteCookieRequired\s*$/m', (string) $method->getDocComment(), 'Nextcloud 31 to 33 read only the annotation');
    }

    public function testReadsNothingFromTheRequest(): void
    {
        // The token is in the URL, so the router puts it in the request; the page must not
        // look, or it could start answering differently for a real share
        $request = $this->createMock(IRequest::class);
        $request->expects($this->never())->method($this->anything());

        $this->controller(['https://a.example'], $request)->page();
        $this->controller([], $request)->page();
    }

    /** @param list<string> $origins */
    private function controller(array $origins, ?IRequest $request = null): EmbedPageController
    {
        $list = $this->createMock(EmbedOrigins::class);
        $list->method('list')->willReturn($origins);
        $list->method('isEnabled')->willReturn($origins !== []);

        return new EmbedPageController('threedviewer', $request ?? $this->createMock(IRequest::class), $list, new ResponseBuilder($this->createMock(ModelFileSupport::class)));
    }
}
