<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Controller;

use OCA\ThreeDViewer\Controller\ThumbnailController;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\NoteAccess;
use OCA\ThreeDViewer\Service\NoteAccessResult;
use OCA\ThreeDViewer\Service\ResponseBuilder;
use OCA\ThreeDViewer\Service\ThumbnailService;
use OCA\ThreeDViewer\Service\ThumbnailStoreResult;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\ICache;
use OCP\ICacheFactory;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserSession;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class ThumbnailControllerTest extends TestCase
{
    private const PNG = "\x89PNG-body";

    private ThumbnailService&MockObject $thumbnails;
    private NoteAccess&MockObject $access;
    private Folder&MockObject $home;
    private IRequest&MockObject $request;
    private LoggerInterface&MockObject $logger;
    private IUserSession&MockObject $session;
    private ThumbnailController $controller;

    protected function setUp(): void
    {
        $this->thumbnails = $this->createMock(ThumbnailService::class);
        $this->access = $this->createMock(NoteAccess::class);
        $this->request = $this->createMock(IRequest::class);
        $this->logger = $this->createMock(LoggerInterface::class);

        $this->home = $this->createMock(Folder::class);
        $this->home->method('getRelativePath')->willReturnCallback(static fn (string $p): string => preg_replace('#^/alice/files#', '', $p));
        $rootFolder = $this->createMock(IRootFolder::class);
        $rootFolder->method('getUserFolder')->with('alice')->willReturn($this->home);

        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('alice');
        $this->session = $this->createMock(IUserSession::class);
        $this->session->method('getUser')->willReturn($user);

        $this->controller = $this->buildController(self::PNG, $rootFolder);
    }

    private function buildController(string $body, IRootFolder $rootFolder): ThumbnailController
    {
        $cacheFactory = $this->createMock(ICacheFactory::class);
        $cacheFactory->method('createDistributed')->willReturn($this->createMock(ICache::class));

        return new class ('threedviewer', $this->request, $rootFolder, $this->session, $this->thumbnails, $this->access, new ResponseBuilder($this->createMock(ModelFileSupport::class)), $this->createMock(ModelFileSupport::class), $this->logger, $cacheFactory, $body) extends ThumbnailController {
            public function __construct(
                string $appName,
                IRequest $request,
                IRootFolder $rootFolder,
                IUserSession $userSession,
                ThumbnailService $thumbnailService,
                NoteAccess $noteAccess,
                ResponseBuilder $responseBuilder,
                ModelFileSupport $modelFileSupport,
                LoggerInterface $logger,
                ICacheFactory $cacheFactory,
                private readonly string $body,
            ) {
                parent::__construct($appName, $request, $rootFolder, $userSession, $thumbnailService, $noteAccess, $responseBuilder, $modelFileSupport, $logger, $cacheFactory);
            }

            protected function readBody(): string
            {
                return $this->body;
            }
        };
    }

    private function file(string $name, string $etag = '"e1"', string $path = '/alice/files/models'): File&MockObject
    {
        $file = $this->createMock(File::class);
        $file->method('getName')->willReturn($name);
        $file->method('getExtension')->willReturn(pathinfo($name, PATHINFO_EXTENSION));
        $file->method('getEtag')->willReturn($etag);
        $file->method('getSize')->willReturn(1234);
        $file->method('getPath')->willReturn($path . '/' . $name);

        return $file;
    }

    /** @param array<int, array<\OCP\Files\Node>> $byId */
    private function filesById(array $byId): void
    {
        $this->home->method('getById')->willReturnCallback(static fn (int $id): array => $byId[$id] ?? []);
    }

    public function testStoresForCurrentVersion(): void
    {
        $this->filesById([7 => [$this->file('a.glb')]]);
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true));
        $this->thumbnails->expects($this->once())->method('store')->with(7, '"e1"', self::PNG)->willReturn(ThumbnailStoreResult::Stored);

        $response = $this->controller->storeThumbnail(7, '"e1"');

        $this->assertSame(201, $response->getStatus());
        $this->assertSame(['status' => 'stored'], $response->getData());
    }

    public function testStaleEtagIsRejected(): void
    {
        $this->filesById([7 => [$this->file('a.glb', '"e2"')]]);
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true));
        $this->thumbnails->expects($this->never())->method('store');

        $response = $this->controller->storeThumbnail(7, '"e1"');

        $this->assertSame(412, $response->getStatus());
        $this->assertSame(['status' => 'stale'], $response->getData());
    }

    public function testMissingEtagGives400(): void
    {
        $this->filesById([7 => [$this->file('a.glb')]]);
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true));
        $this->thumbnails->expects($this->never())->method('store');

        $this->assertSame(400, $this->controller->storeThumbnail(7)->getStatus());
    }

    public function testReadOnlyUserIsForbidden(): void
    {
        $this->filesById([7 => [$this->file('a.glb')]]);
        $this->access->method('forUser')->willReturn(new NoteAccessResult(false));
        $this->thumbnails->expects($this->never())->method('store');

        $this->assertSame(403, $this->controller->storeThumbnail(7, '"e1"')->getStatus());
    }

    public function testUnreadableFileGives404(): void
    {
        $this->filesById([]);
        $this->thumbnails->expects($this->never())->method('store');

        $this->assertSame(404, $this->controller->storeThumbnail(7, '"e1"')->getStatus());
    }

    public function testFolderGives404(): void
    {
        $this->filesById([7 => [$this->createMock(Folder::class)]]);
        $this->thumbnails->expects($this->never())->method('store');

        $this->assertSame(404, $this->controller->storeThumbnail(7, '"e1"')->getStatus());
    }

    public function testExistingVersionGives409(): void
    {
        $this->filesById([7 => [$this->file('a.glb')]]);
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true));
        $this->thumbnails->method('store')->willReturn(ThumbnailStoreResult::Exists);

        $response = $this->controller->storeThumbnail(7, '"e1"');

        $this->assertSame(409, $response->getStatus());
        $this->assertSame(['status' => 'exists'], $response->getData());
    }

    public function testInvalidImageGives400(): void
    {
        $this->filesById([7 => [$this->file('a.glb')]]);
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true));
        $this->thumbnails->method('store')->willReturn(ThumbnailStoreResult::InvalidImage);

        $this->assertSame(400, $this->controller->storeThumbnail(7, '"e1"')->getStatus());
    }

    public function testDeclaredOversizeBodyGives400WithoutStoring(): void
    {
        $this->filesById([7 => [$this->file('a.glb')]]);
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true));
        $this->request->method('getHeader')->with('Content-Length')->willReturn((string) (ThumbnailService::MAX_BYTES + 1));
        $this->thumbnails->expects($this->never())->method('store');

        $this->assertSame(400, $this->controller->storeThumbnail(7, '"e1"')->getStatus());
    }

    public function testUnsupportedExtensionGives404(): void
    {
        $this->filesById([7 => [$this->file('notes.txt')]]);
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true));
        $this->thumbnails->expects($this->never())->method('store');

        $this->assertSame(404, $this->controller->storeThumbnail(7, '"e1"')->getStatus());
    }

    public function testNoSessionGives401(): void
    {
        $session = $this->createMock(IUserSession::class);
        $session->method('getUser')->willReturn(null);
        $this->session = $session;
        $controller = $this->buildController(self::PNG, $this->createMock(IRootFolder::class));
        $this->thumbnails->expects($this->never())->method('store');

        $this->assertSame(401, $controller->storeThumbnail(7, '"e1"')->getStatus());
    }

    public function testStoreFailureGives500AndIsLogged(): void
    {
        $this->filesById([7 => [$this->file('a.glb')]]);
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true));
        $this->thumbnails->method('store')->willThrowException(new \RuntimeException('disk full'));
        $this->logger->expects($this->atLeastOnce())->method('error');

        $this->assertSame(500, $this->controller->storeThumbnail(7, '"e1"')->getStatus());
    }

    public function testAccessCheckFailureGives500(): void
    {
        $this->filesById([7 => [$this->file('a.glb')]]);
        $this->access->method('forUser')->willThrowException(new \RuntimeException('db down'));
        $this->thumbnails->expects($this->never())->method('store');

        $this->assertSame(500, $this->controller->storeThumbnail(7, '"e1"')->getStatus());
    }

    public function testUploadRouteRequiresCsrf(): void
    {
        $method = new \ReflectionMethod(ThumbnailController::class, 'storeThumbnail');

        $this->assertSame([], $method->getAttributes(NoCSRFRequired::class));
        $this->assertNotSame([], $method->getAttributes(NoAdminRequired::class));
    }

    public function testStatusRouteRequiresCsrf(): void
    {
        $method = new \ReflectionMethod(ThumbnailController::class, 'status');

        $this->assertSame([], $method->getAttributes(NoCSRFRequired::class));
        $this->assertNotSame([], $method->getAttributes(NoAdminRequired::class));
    }

    public function testClearRouteIsGone(): void
    {
        $this->assertFalse(method_exists(ThumbnailController::class, 'clearThumbnails'));
    }

    public function testStatusReportsEachReadableModel(): void
    {
        $this->filesById([
            3 => [$this->file('a.glb', '"e1"', '/alice/files/models')],
            4 => [$this->file('b.stl', '"e2"', '/alice/files')],
        ]);
        $this->access->method('forUser')->willReturnCallback(static fn (int $id): NoteAccessResult => new NoteAccessResult($id === 3));
        $this->thumbnails->method('has')->willReturnCallback(static fn (int $id, string $etag): bool => $id === 3 && $etag === '"e1"');

        $response = $this->controller->status('3,4');

        $this->assertSame(200, $response->getStatus());
        $this->assertEquals([
            'files' => [
                '3' => ['name' => 'a.glb', 'dir' => '/models', 'size' => 1234, 'etag' => '"e1"', 'canEdit' => true, 'hasThumbnail' => true],
                '4' => ['name' => 'b.stl', 'dir' => '/', 'size' => 1234, 'etag' => '"e2"', 'canEdit' => false, 'hasThumbnail' => false],
            ],
        ], json_decode((string) json_encode($response->getData()), true));
    }

    public function testStatusOmitsUnreadableAndNonModelIds(): void
    {
        $this->filesById([
            3 => [$this->file('a.glb')],
            5 => [$this->file('notes.txt')],
            6 => [$this->createMock(Folder::class)],
        ]);
        $this->access->method('forUser')->willReturnCallback(static fn (int $id): ?NoteAccessResult => $id === 8 ? null : new NoteAccessResult(true));
        $this->thumbnails->method('has')->willReturn(false);

        $files = (array) $this->controller->status('3,5,6,9')->getData()['files'];

        $this->assertSame([3], array_keys($files));
    }

    public function testStatusOmitsFileWithoutAccessResult(): void
    {
        $this->filesById([3 => [$this->file('a.glb')]]);
        $this->access->method('forUser')->willReturn(null);

        $this->assertSame([], (array) $this->controller->status('3')->getData()['files']);
    }

    public function testStatusSkipsAFailingFileAndKeepsTheRest(): void
    {
        $this->filesById([3 => [$this->file('a.glb')], 4 => [$this->file('b.glb')]]);
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true));
        $this->thumbnails->method('has')->willReturnCallback(static function (int $id): bool {
            if ($id === 3) {
                throw new \RuntimeException('boom');
            }

            return true;
        });
        $this->logger->expects($this->atLeastOnce())->method('warning');

        $response = $this->controller->status('3,4');

        $this->assertSame(200, $response->getStatus());
        $this->assertSame([4], array_keys((array) $response->getData()['files']));
    }

    public function testStatusWithNothingReadableEncodesAsJsonObject(): void
    {
        $this->filesById([]);

        $this->assertSame('{"files":{}}', json_encode($this->controller->status('3')->getData()));
    }

    public function testStatusRejectsMoreThan200Ids(): void
    {
        $this->filesById([]);
        $this->assertSame(400, $this->controller->status(implode(',', range(1, 201)))->getStatus());
        $this->assertSame(200, $this->controller->status(implode(',', range(1, 200)))->getStatus());
    }

    public function testStatusRejectsNonNumericIds(): void
    {
        foreach (['1,abc', '', '0', '-2', '1,,2', '1.5', '99999999999999999999'] as $ids) {
            $this->assertSame(400, $this->controller->status($ids)->getStatus(), "ids=$ids");
        }
    }

    public function testStatusWithoutSessionGives401(): void
    {
        $session = $this->createMock(IUserSession::class);
        $session->method('getUser')->willReturn(null);
        $this->session = $session;
        $controller = $this->buildController(self::PNG, $this->createMock(IRootFolder::class));

        $this->assertSame(401, $controller->status('3')->getStatus());
    }
}
