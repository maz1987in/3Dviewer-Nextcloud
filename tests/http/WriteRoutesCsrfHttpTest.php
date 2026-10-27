<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Http;

require_once __DIR__ . '/HttpTestCase.php';

use OCP\IConfig;
use OCP\Server;

/**
 * Every route that changes data checks Nextcloud's CSRF token.
 *
 * These four carried #[NoCSRFRequired], so a request that rode on the user's session
 * cookie, from a page that was not the app, was accepted without the token. The browser
 * sends the cookie in a session, so it takes a session-based client without the token to
 * stand in for that page; a Basic-Auth client with OCS-APIRequest would be accepted by
 * the check on its own (see HttpTestCase::basic()) and prove nothing.
 *
 * Each test sends the same request twice from one logged-in session: without the token
 * it must be answered 412, and with it the route must run, which shows the rejection was
 * the token and not the request.
 */
class WriteRoutesCsrfHttpTest extends HttpTestCase
{
    private const CONFIG_KEY = 'file_sort';

    public function testSavingViewerSettingsNeedsTheRequestToken(): void
    {
        $uid = $this->newUser();
        [$client, $token] = $this->session($uid);
        $url = '/index.php/apps/threedviewer/config';
        $body = ['json' => ['values' => [self::CONFIG_KEY => 'type']]];

        $without = $client->put($url, $body);

        $this->assertSame(412, $without->getStatusCode(), 'a failed CSRF check answers 412 Precondition Failed');
        $this->assertSame('', $this->storedConfig($uid), 'the rejected request must not have saved anything');

        $with = $client->put($url, $body + ['headers' => ['requesttoken' => $token]]);

        $this->assertNotSame(412, $with->getStatusCode(), 'the same session with its token is accepted');
        $this->assertSame('type', $this->storedConfig($uid));
    }

    public function testOnlyTheSettingsTheViewerStoresAreAccepted(): void
    {
        $uid = $this->newUser();
        [$client, $token] = $this->session($uid);
        $options = ['headers' => ['requesttoken' => $token], 'json' => ['values' => [self::CONFIG_KEY => 'type', 'user_preferences' => '{}']]];

        $response = $client->put('/index.php/apps/threedviewer/config', $options);

        $this->assertSame(400, $response->getStatusCode());
        $this->assertSame('', $this->storedConfig($uid), 'a refused request stores none of its values');
    }

    public function testReindexingNeedsTheRequestToken(): void
    {
        $uid = $this->newUser();
        [$client, $token] = $this->session($uid);
        $url = '/index.php/apps/threedviewer/api/files/index';

        $without = $client->post($url);
        $with = $client->post($url, ['headers' => ['requesttoken' => $token]]);

        $this->assertSame(412, $without->getStatusCode(), 'a failed CSRF check answers 412 Precondition Failed');
        $this->assertNotSame(412, $with->getStatusCode(), 'the same session with its token is accepted');
    }

    public function testSendingAModelToTheSlicerNeedsTheRequestToken(): void
    {
        $uid = $this->newUser();
        [$client, $token] = $this->session($uid);
        $url = '/index.php/apps/threedviewer/api/slicer/temp?filename=probe.stl';
        $options = ['body' => "solid t\nendsolid t\n", 'headers' => ['Content-Type' => 'application/octet-stream']];

        $without = $client->post($url, $options);
        $with = $client->post($url, ['headers' => $options['headers'] + ['requesttoken' => $token]] + $options);

        $this->assertSame(412, $without->getStatusCode(), 'a failed CSRF check answers 412 Precondition Failed');
        $this->assertNotSame(412, $with->getStatusCode(), 'the same session with its token is accepted');
    }

    public function testDeletingTheSlicerCopyNeedsTheRequestToken(): void
    {
        $uid = $this->newUser();
        $file = $this->newModel($uid);
        [$client, $token] = $this->session($uid);
        $url = '/index.php/apps/threedviewer/api/slicer/temp/' . $file->getId();

        $without = $client->delete($url);
        $with = $client->delete($url, ['headers' => ['requesttoken' => $token]]);

        $this->assertSame(412, $without->getStatusCode(), 'a failed CSRF check answers 412 Precondition Failed');
        $this->assertNotSame(412, $with->getStatusCode(), 'the same session with its token is accepted');
    }

    private function storedConfig(string $uid): string
    {
        return Server::get(IConfig::class)->getUserValue($uid, 'threedviewer', self::CONFIG_KEY, '');
    }
}
