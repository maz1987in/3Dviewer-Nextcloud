<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Integration;

use OCA\ThreeDViewer\Controller\FileController;
use OCA\ThreeDViewer\Db\FileIndexMapper;
use OCA\ThreeDViewer\Service\FileIndexService;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\PathLocator;
use OCA\ThreeDViewer\Service\ResponseBuilder;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\JSONResponse;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\ICacheFactory;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserManager;
use OCP\IUserSession;
use OCP\Server;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The signed-in name-to-id lookup, against real storage.
 *
 * A public share resolves a dependency by asking the model what it declared. Signed in,
 * the client has to turn a declared name into a file id first, and it does that through
 * these two endpoints — so this is where the same case-sensitivity shows up for anyone
 * who is logged in.
 *
 * The controller is built here with the container's own services and only the request and
 * session stubbed, because those are the two things a CLI test has no version of. Storage,
 * the database and the file API are the real ones.
 */
class FileControllerLookupTest extends TestCase
{
    private const PASSWORD = 'integration-suite-password-Aa1!';

    private string $uid;

    private Folder $models;

    protected function setUp(): void
    {
        $this->uid = 'tdv-it-' . bin2hex(random_bytes(6));
        Server::get(IUserManager::class)->createUser($this->uid, self::PASSWORD);

        $home = Server::get(IRootFolder::class)->getUserFolder($this->uid);
        $this->models = $home->newFolder('models');
    }

    protected function tearDown(): void
    {
        $user = Server::get(IUserManager::class)->get($this->uid);
        $user?->delete();
    }

    public function testFindsAFileWhoseNameCaseDiffersFromTheRequest(): void
    {
        $texture = $this->models->newFile('wood.png', 'PNG');

        $body = $this->decode($this->controller(['path' => 'models/WOOD.PNG'])->findFileByPath());

        $this->assertSame($texture->getId(), $body['id'] ?? null);
    }

    /**
     * The case that reaches users: MTL files written on Windows name a texture directory
     * as `Textures/wood.png` for a folder saved as `textures`. The client sends the whole
     * declared path, so a single wrong segment loses the texture.
     */
    public function testFindsAFileWhoseDirectoryCaseDiffersFromTheRequest(): void
    {
        $textures = $this->models->newFolder('textures');
        $texture = $textures->newFile('wood.png', 'PNG');

        $body = $this->decode($this->controller(['path' => 'models/Textures/wood.png'])->findFileByPath());

        $this->assertSame($texture->getId(), $body['id'] ?? null);
    }

    public function testPrefersTheExactNameWhenBothCasesExist(): void
    {
        $this->models->newFile('Wood.png', 'WRONG');
        $exact = $this->models->newFile('wood.png', 'RIGHT');

        $body = $this->decode($this->controller(['path' => 'models/wood.png'])->findFileByPath());

        $this->assertSame($exact->getId(), $body['id'] ?? null);
    }

    /**
     * The walk matches names inside a folder, so it can only ever go downwards. This
     * pins that: a path climbing out still fails, rather than being resolved segment by
     * segment into somewhere the request never had a right to reach.
     */
    public function testStillRefusesAPathThatClimbsOutOfTheUserFolder(): void
    {
        $response = $this->controller(['path' => '../../../etc/passwd'])->findFileByPath();

        $this->assertSame(Http::STATUS_NOT_FOUND, $response->getStatus());
    }

    public function testReportsAMissingFileAsNotFound(): void
    {
        $this->models->newFile('wood.png', 'PNG');

        $response = $this->controller(['path' => 'models/absent.png'])->findFileByPath();

        $this->assertSame(Http::STATUS_NOT_FOUND, $response->getStatus());
    }

    public function testListsAFolderWhoseCaseDiffersFromTheRequest(): void
    {
        $this->models->newFile('chair.obj', "v 0 0 0\n");
        $this->models->newFile('wood.png', 'PNG');

        $body = $this->decode($this->controller([
            'folder' => 'Models',
            'includeDependencies' => '1',
        ])->listFiles());

        $names = array_column(is_array($body['files'] ?? null) ? $body['files'] : [], 'name');
        $this->assertContains('chair.obj', $names);
        $this->assertContains('wood.png', $names);
    }

    /** @return array<string, mixed> */
    private function decode(JSONResponse $response): array
    {
        $this->assertSame(Http::STATUS_OK, $response->getStatus(), 'response was not OK');
        $data = $response->getData();
        $this->assertIsArray($data);

        /* @var array<string, mixed> $data */
        return $data;
    }

    /**
     * The controller as the container builds it, with the request and session supplied.
     *
     * @param array<string, string> $params query parameters for this call
     */
    private function controller(array $params): FileController
    {
        $request = $this->createMock(IRequest::class);
        $request->method('getParam')->willReturnCallback(
            static fn (string $key, $default = null) => $params[$key] ?? $default,
        );

        $user = Server::get(IUserManager::class)->get($this->uid);
        $this->assertInstanceOf(IUser::class, $user);
        $session = $this->createMock(IUserSession::class);
        $session->method('getUser')->willReturn($user);

        return new FileController(
            'threedviewer',
            $request,
            Server::get(IRootFolder::class),
            $session,
            Server::get(FileIndexMapper::class),
            Server::get(FileIndexService::class),
            // The favourites filter is the only thing the tag manager drives, and nothing
            // here asks for it. The interface is also absent on some server versions, where
            // the container hands the app null for exactly this reason.
            null,
            Server::get(ModelFileSupport::class),
            Server::get(ResponseBuilder::class),
            Server::get(LoggerInterface::class),
            Server::get(ICacheFactory::class),
            Server::get(PathLocator::class),
        );
    }
}
