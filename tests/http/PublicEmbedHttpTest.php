<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Http;

require_once __DIR__ . '/HttpTestCase.php';

use OCP\IConfig;
use OCP\IDBConnection;
use OCP\Server;
use OCP\Share\IManager as ShareManager;

/**
 * Whether a share may be embedded, through the real middleware: PublicShareMiddleware
 * refuses a token PublicEmbedController calls invalid, as it does for the public file
 * routes, so a share that changed after its code was pasted is simply gone.
 */
class PublicEmbedHttpTest extends HttpTestCase
{
    private const HEADERS = ['OCS-APIRequest' => 'true'];
    /** What PublicShareMiddleware records a refused token under: the class and method. */
    private const THROTTLE_ACTION = 'PublicEmbedController::show';

    /** @var list<string> */
    private array $before = [];

    protected function setUp(): void
    {
        // Refused tokens are throttled per address, and every test here sends some
        self::forgetRefusals();
        $this->before = self::storedEmbedOrigins();
        $this->setEmbedOrigins(['https://shop.example']);
    }

    protected function tearDown(): void
    {
        $this->setEmbedOrigins($this->before);
        parent::tearDown();
    }

    public function testALinkShareOfAModelIsEmbeddable(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner, 'part.stl');
        $token = $this->shareByLink($model, $owner);

        $response = $this->embed($token);

        $this->assertSame(200, $response->getStatusCode());
        $data = self::json($response);
        $this->assertSame($model->getId(), $data['fileId'] ?? null);
        $this->assertSame('part.stl', $data['filename'] ?? null);
        // With or without index.php, as the server is set up
        $this->assertMatchesRegularExpression('~^' . preg_quote(self::base(), '~') . '(/index\.php)?/s/' . $token . '$~', $data['shareUrl'] ?? '');
        $this->assertSame(($data['shareUrl'] ?? '') . '/download', $data['downloadUrl'] ?? null);
    }

    public function testAShareThatGainedAPasswordIsNoLongerEmbeddable(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner, 'secret-part.stl');
        $token = $this->shareByLink($model, $owner);
        $this->assertSame(200, $this->embed($token)->getStatusCode());

        $manager = Server::get(ShareManager::class);
        $share = $manager->getShareByToken($token);
        $share->setPassword('A-later-password-9!');
        $manager->updateShare($share);

        $response = $this->embed($token);
        $this->assertSame(404, $response->getStatusCode());
        $body = (string) $response->getBody();
        $this->assertStringNotContainsString('secret-part', $body);
        $this->assertStringNotContainsString((string) $model->getId(), $body);
    }

    public function testADeletedShareIsGone(): void
    {
        $owner = $this->newUser();
        $token = $this->shareByLink($this->newModel($owner), $owner);
        $manager = Server::get(ShareManager::class);

        $manager->deleteShare($manager->getShareByToken($token));

        $this->assertSame(404, $this->embed($token)->getStatusCode());
    }

    public function testAnExpiredShareIsGone(): void
    {
        $owner = $this->newUser();
        $token = $this->shareByLink($this->newModel($owner), $owner);
        // The share manager refuses a date in the past, so the row is aged directly
        $query = Server::get(IDBConnection::class)->getQueryBuilder();
        $query->update('share')
            ->set('expiration', $query->createNamedParameter('2001-01-01 00:00:00'))
            ->where($query->expr()->eq('token', $query->createNamedParameter($token)))
            ->executeStatement();

        $this->assertSame(404, $this->embed($token)->getStatusCode());
    }

    public function testAFolderShareIsNotEmbeddable(): void
    {
        $owner = $this->newUser();
        $folder = Server::get(\OCP\Files\IRootFolder::class)->getUserFolder($owner)->newFolder('models');
        $folder->newFile('inside.stl', "solid t\nendsolid t\n");
        $token = $this->shareByLink($folder, $owner);

        $response = $this->embed($token);

        $this->assertSame(404, $response->getStatusCode());
        $this->assertStringNotContainsString('inside', (string) $response->getBody());
    }

    public function testAnUnsupportedFileIsNotEmbeddable(): void
    {
        $owner = $this->newUser();
        $text = Server::get(\OCP\Files\IRootFolder::class)->getUserFolder($owner)->newFile('notes.txt', 'hello');

        $this->assertSame(404, $this->embed($this->shareByLink($text, $owner))->getStatusCode());
    }

    public function testWithEmbeddingOffNothingIsEmbeddable(): void
    {
        $owner = $this->newUser();
        $token = $this->shareByLink($this->newModel($owner), $owner);
        $this->setEmbedOrigins([]);

        $this->assertSame(404, $this->embed($token)->getStatusCode());
    }

    public function testWorksWithoutAnyCookie(): void
    {
        $owner = $this->newUser();
        $token = $this->shareByLink($this->newModel($owner), $owner);
        // What a frame on another site sends: no same-site cookies, at most a stray
        // session cookie that the browser does attach
        $session = Server::get(IConfig::class)->getSystemValueString('instanceid');

        $this->assertSame(200, $this->embed($token)->getStatusCode());
        $this->assertSame(200, $this->embed($token, ['Cookie' => $session . '=stray'])->getStatusCode());
    }

    public function testARefusedTokenCountsTowardsTheThrottle(): void
    {
        $this->assertSame(0, self::refusals());

        $this->assertSame(404, $this->embed('nosuchtoken')->getStatusCode());

        $this->assertSame(1, self::refusals(), 'the middleware throttles a token that is not embeddable');
    }

    private static function refusals(): int
    {
        $query = Server::get(IDBConnection::class)->getQueryBuilder();
        $query->select($query->func()->count('*'))
            ->from('bruteforce_attempts')
            ->where($query->expr()->eq('action', $query->createNamedParameter(self::THROTTLE_ACTION)));

        return (int) $query->executeQuery()->fetchOne();
    }

    private static function forgetRefusals(): void
    {
        $query = Server::get(IDBConnection::class)->getQueryBuilder();
        $query->delete('bruteforce_attempts')
            ->where($query->expr()->eq('action', $query->createNamedParameter(self::THROTTLE_ACTION)))
            ->executeStatement();
    }

    /** @param array<string, string> $headers */
    private function embed(string $token, array $headers = []): \Psr\Http\Message\ResponseInterface
    {
        return $this->anonymous()->get('/ocs/v2.php/apps/threedviewer/public/embed/' . $token, ['headers' => self::HEADERS + $headers]);
    }
}
