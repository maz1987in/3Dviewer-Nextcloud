<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Http;

use GuzzleHttp\Client;
use GuzzleHttp\Cookie\CookieJar;
use OCA\ThreeDViewer\Db\NoteMapper;
use OCP\Constants;
use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\Files\Node;
use OCP\IUserManager;
use OCP\Server;
use OCP\Share\IManager as ShareManager;
use OCP\Share\IShare;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;

/**
 * Real HTTP requests against a running server, so every request passes through the
 * middleware — the security middleware's CSRF check and PublicShareMiddleware's password
 * check — that calling a controller directly skips. The advisory GHSA-gjh8-x4wm-3cfj was
 * exactly a bug in that layer, invisible to any test that constructs the controller.
 *
 * The server and this process share one installation: users, files and shares made here
 * are what the server serves.
 */
abstract class HttpTestCase extends TestCase
{
    protected const PASSWORD = 'integration-suite-password-Aa1!';

    /** @var list<string> */
    private array $users = [];

    protected static function base(): string
    {
        $base = getenv('TDV_HTTP_BASE');
        if (!is_string($base) || $base === '') {
            // No skip: a suite that skips without a server reports coverage it lacks.
            self::fail('TDV_HTTP_BASE is not set; point it at a running server, e.g. http://localhost:8080');
        }

        return rtrim($base, '/');
    }

    protected function tearDown(): void
    {
        foreach ($this->users as $uid) {
            Server::get(IUserManager::class)->get($uid)?->delete();
        }
    }

    protected function newUser(): string
    {
        $uid = 'tdv-http-' . bin2hex(random_bytes(6));
        Server::get(IUserManager::class)->createUser($uid, self::PASSWORD);
        $this->users[] = $uid;

        return $uid;
    }

    protected function newModel(string $uid, string $name = 'model.stl'): File
    {
        return Server::get(IRootFolder::class)->getUserFolder($uid)->newFile($name, "solid t\nendsolid t\n");
    }

    protected function shareWithUser(File $file, string $owner, string $recipient, int $permissions): void
    {
        $manager = Server::get(ShareManager::class);
        $share = $manager->newShare();
        $share->setNode($file)
            ->setShareType(IShare::TYPE_USER)
            ->setSharedWith($recipient)
            ->setSharedBy($owner)
            ->setShareOwner($owner)
            ->setPermissions($permissions);
        $manager->createShare($share);
    }

    /**
     * @param int $permissions PERMISSION_CREATE alone on a folder makes a file-drop link
     * @return string the share token
     */
    protected function shareByLink(Node $node, string $owner, ?string $password = null, int $permissions = Constants::PERMISSION_READ): string
    {
        $manager = Server::get(ShareManager::class);
        $share = $manager->newShare();
        $share->setNode($node)
            ->setShareType(IShare::TYPE_LINK)
            ->setSharedBy($owner)
            ->setShareOwner($owner)
            ->setPermissions($permissions);
        if ($password !== null) {
            $share->setPassword($password);
        }

        return $manager->createShare($share)->getToken();
    }

    /**
     * Basic auth with no cookies: this client tests authorisation alone, not CSRF.
     *
     * Nextcloud's CSRF check (`Request::passesCSRFCheck()`) treats the OCS-APIRequest header
     * as proof of a non-browser client and accepts it on its own, for any controller, not only
     * an `OCSController` — the strict-cookie check it runs first passes too, since that header
     * also exempts the request from needing a session cookie. Every non-browser Nextcloud API
     * client sends it for exactly this reason; without it, a route that (rightly) carries no
     * `NoCSRFRequired` rejects even a request with fully valid credentials, which is what this
     * suite verified by first sending Basic Auth alone and getting back 412 CSRF failures
     * instead of the 200/403/404 the tests below expect.
     */
    protected function basic(string $uid): Client
    {
        return new Client([
            'base_uri' => self::base(),
            'auth' => [$uid, self::PASSWORD],
            'headers' => ['OCS-APIRequest' => 'true'],
            'http_errors' => false,
            'allow_redirects' => false,
        ]);
    }

    protected function anonymous(): Client
    {
        return new Client(['base_uri' => self::base(), 'http_errors' => false, 'allow_redirects' => false]);
    }

    /**
     * A browser-like session: logged in through the login form, with cookies. Requests from
     * it are subject to the CSRF check, which is what the CSRF tests need.
     *
     * @return array{0: Client, 1: string} the client and a valid request token
     */
    protected function session(string $uid): array
    {
        $client = new Client([
            'base_uri' => self::base(),
            'cookies' => new CookieJar(),
            'http_errors' => false,
            'allow_redirects' => false,
        ]);

        $login = (string) $client->get('/index.php/login')->getBody();
        self::assertSame(1, preg_match('/data-requesttoken="([^"]+)"/', $login, $match), 'login page carries a request token');
        // The login form's own controller rejects a same-origin submission that carries no
        // Origin header at all (LoginController::tryLogin treats a blank origin as an
        // untrusted one, to stop the CSRF check itself being used to trigger bruteforce
        // throttling). A browser always sends this header; Guzzle does not, so it is set
        // explicitly here to match what a real browser's form submission would send.
        $client->post('/index.php/login', [
            'headers' => ['Origin' => self::base()],
            'form_params' => [
                'user' => $uid,
                'password' => self::PASSWORD,
                'requesttoken' => html_entity_decode($match[1]),
                'timezone' => 'UTC',
                'timezone_offset' => '0',
            ],
        ]);

        $token = json_decode((string) $client->get('/index.php/csrftoken')->getBody(), true)['token'] ?? null;
        self::assertIsString($token, 'logged in and received a CSRF token');

        return [$client, $token];
    }

    protected static function notesUrl(int $fileId, ?int $noteId = null): string
    {
        return '/index.php/apps/threedviewer/api/notes/' . $fileId . ($noteId === null ? '' : '/' . $noteId);
    }

    protected static function publicNotesUrl(string $token, int $fileId): string
    {
        return '/ocs/v2.php/apps/threedviewer/public/notes/' . $token . '/' . $fileId;
    }

    /** @return array<string, mixed> */
    protected static function annotation(string $text): array
    {
        return ['type' => 'annotation', 'payload' => ['space' => 'model', 'point' => ['x' => 1, 'y' => 2, 'z' => 3], 'text' => $text]];
    }

    /** @return array<string, mixed>|null */
    protected static function json(ResponseInterface $response): ?array
    {
        $data = json_decode((string) $response->getBody(), true);

        return is_array($data) ? $data : null;
    }

    protected static function noteCount(int $fileId): int
    {
        return Server::get(NoteMapper::class)->countByFile($fileId);
    }
}
