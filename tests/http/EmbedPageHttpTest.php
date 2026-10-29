<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Http;

require_once __DIR__ . '/HttpTestCase.php';

use OCP\IConfig;
use OCP\Server;
use Psr\Http\Message\ResponseInterface;

/**
 * The embed page's headers, through the real server: only it may be framed, only by the
 * listed sites, and it is the same page whatever the token.
 */
class EmbedPageHttpTest extends HttpTestCase
{
    private const SITE = 'https://shop.example';

    /** @var list<string> */
    private array $before = [];

    protected function setUp(): void
    {
        $this->before = self::storedEmbedOrigins();
        $this->setEmbedOrigins([self::SITE]);
    }

    protected function tearDown(): void
    {
        $this->setEmbedOrigins($this->before);
        parent::tearDown();
    }

    public function testTheShellMayBeFramedByTheListedSites(): void
    {
        $response = $this->shell('anytoken');

        $this->assertSame(200, $response->getStatusCode());
        $this->assertStringContainsString("frame-ancestors 'self' " . self::SITE, self::csp($response));
    }

    public function testTheShellIsTheSameForEveryToken(): void
    {
        $owner = $this->newUser();
        $token = $this->shareByLink($this->newModel($owner, 'shown-part.stl'), $owner);

        $real = self::comparable($this->shell($token));
        $none = self::comparable($this->shell('nosuchtoken'));

        $this->assertSame($none, $real);
        $this->assertStringNotContainsString('shown-part', $real);
    }

    public function testNoOtherPageMayBeFramed(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        $token = $this->shareByLink($model, $owner);

        $sharePage = $this->anonymous()->get('/index.php/s/' . $token);
        $viewerPage = $this->basic($owner)->get('/index.php/apps/threedviewer/f/' . $model->getId());

        foreach (['share page' => $sharePage, 'viewer page' => $viewerPage] as $name => $response) {
            $this->assertSame(200, $response->getStatusCode(), $name);
            $this->assertStringContainsString("frame-ancestors 'self'", self::csp($response), $name);
            $this->assertStringNotContainsString('shop.example', self::csp($response), $name);
        }
    }

    public function testWithEmbeddingOffTheShellCannotBeFramed(): void
    {
        $this->setEmbedOrigins([]);

        $response = $this->shell('anytoken');

        $this->assertSame(404, $response->getStatusCode());
        $this->assertStringNotContainsString('shop.example', self::csp($response));
    }

    public function testTheShellNeedsNoCookie(): void
    {
        $session = Server::get(IConfig::class)->getSystemValueString('instanceid');

        $this->assertSame(200, $this->shell('anytoken', ['Cookie' => $session . '=stray'])->getStatusCode());
    }

    /** @param array<string, string> $headers */
    private function shell(string $token, array $headers = []): ResponseInterface
    {
        return $this->anonymous()->get('/index.php/apps/threedviewer/embed/' . $token, ['headers' => $headers]);
    }

    private static function csp(ResponseInterface $response): string
    {
        return implode('; ', $response->getHeader('Content-Security-Policy'));
    }

    /** The body without what changes on every request: the request token and the CSP nonce. */
    private static function comparable(ResponseInterface $response): string
    {
        return (string) preg_replace(
            ['/data-requesttoken="[^"]*"/', '/nonce="[^"]*"/'],
            ['data-requesttoken=""', 'nonce=""'],
            (string) $response->getBody(),
        );
    }
}
