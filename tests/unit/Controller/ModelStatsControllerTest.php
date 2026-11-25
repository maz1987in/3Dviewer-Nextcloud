<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Controller;

use OCA\ThreeDViewer\Controller\ModelStatsController;
use OCA\ThreeDViewer\Db\NoteMapper;
use OCA\ThreeDViewer\Service\FileSettingsService;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\ModelStatsService;
use OCA\ThreeDViewer\Service\ModelStatsStoreResult;
use OCA\ThreeDViewer\Service\NoteAccess;
use OCA\ThreeDViewer\Service\NoteAccessResult;
use OCA\ThreeDViewer\Service\ResponseBuilder;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\Files\File;
use OCP\ICache;
use OCP\ICacheFactory;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserSession;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class ModelStatsControllerTest extends TestCase
{
    private ModelStatsService&MockObject $stats;
    private NoteAccess&MockObject $access;
    private FileSettingsService&MockObject $settings;
    private NoteMapper&MockObject $notes;
    private IRequest&MockObject $request;
    private IUserSession&MockObject $session;
    private ModelStatsController $controller;

    protected function setUp(): void
    {
        $this->stats = $this->createMock(ModelStatsService::class);
        $this->access = $this->createMock(NoteAccess::class);
        $this->settings = $this->createMock(FileSettingsService::class);
        $this->notes = $this->createMock(NoteMapper::class);
        $this->request = $this->createMock(IRequest::class);

        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('alice');
        $this->session = $this->createMock(IUserSession::class);
        $this->session->method('getUser')->willReturn($user);

        $this->controller = $this->buildController($this->session);
    }

    private function buildController(IUserSession $session): ModelStatsController
    {
        $cacheFactory = $this->createMock(ICacheFactory::class);
        $cacheFactory->method('createDistributed')->willReturn($this->createMock(ICache::class));
        $support = $this->createMock(ModelFileSupport::class);

        return new ModelStatsController(
            'threedviewer',
            $this->request,
            $session,
            $this->access,
            $this->stats,
            $this->settings,
            $this->notes,
            new ResponseBuilder($support),
            $support,
            $this->createMock(LoggerInterface::class),
            $cacheFactory,
        );
    }

    private function file(string $etag = '"e1"', int $size = 4321): File&MockObject
    {
        $file = $this->createMock(File::class);
        $file->method('getEtag')->willReturn($etag);
        $file->method('getSize')->willReturn($size);

        return $file;
    }

    private function grant(bool $canEdit, string $name = 'a.stl', string $etag = '"e1"'): void
    {
        $this->access->method('forUser')->willReturn(new NoteAccessResult($canEdit, $name, $this->file($etag)));
    }

    public function testShowReportsTheVersionItsNumbersTheSettingsAndTheNotes(): void
    {
        $this->grant(false);
        $this->stats->method('get')->with(7, '"e1"')->willReturn(['v' => 1]);
        $this->settings->method('settings')->with(7)->willReturn(['unit' => 'in', 'up' => null]);
        $this->notes->method('countByFile')->with(7)->willReturn(3);
        $this->notes->method('firstIdByFile')->with(7)->willReturn(11);

        $response = $this->controller->show(7);

        $this->assertSame(200, $response->getStatus());
        $this->assertSame([
            'fileId' => 7,
            'name' => 'a.stl',
            'size' => 4321,
            'etag' => '"e1"',
            'canEdit' => false,
            'stats' => ['v' => 1],
            'settings' => ['unit' => 'in', 'up' => null],
            'notes' => ['count' => 3, 'firstId' => 11],
        ], $response->getData());
    }

    public function testShowHasNoNumbersForAVersionThatWasNotMeasured(): void
    {
        $this->grant(true);
        $this->stats->method('get')->willReturn(null);
        $this->settings->method('settings')->willReturn(['unit' => null, 'up' => null]);

        $this->assertNull($this->controller->show(7)->getData()['stats']);
    }

    public function testShowAsksForTheNumbersOfTheCurrentVersionOnly(): void
    {
        $this->grant(true, 'a.stl', '"now"');
        $this->settings->method('settings')->willReturn(['unit' => null, 'up' => null]);
        $this->stats->expects($this->once())->method('get')->with(7, '"now"')->willReturn(null);

        $this->controller->show(7);
    }

    public function testAUserWhoCannotReadTheFileGets404FromEveryRoute(): void
    {
        $this->access->method('forUser')->willReturn(null);
        $this->stats->expects($this->never())->method('get');
        $this->stats->expects($this->never())->method('store');

        $this->assertSame(404, $this->controller->show(7)->getStatus());
        $this->assertSame(404, $this->controller->store(7, '"e1"', ['v' => 1])->getStatus());
    }

    public function testAFileThatIsNotAModelGets404(): void
    {
        $this->grant(true, 'notes.txt');
        $this->stats->expects($this->never())->method('get');
        $this->stats->expects($this->never())->method('store');

        $this->assertSame(404, $this->controller->show(7)->getStatus());
        $this->assertSame(404, $this->controller->store(7, '"e1"', ['v' => 1])->getStatus());
    }

    public function testAnIdThatIsNotPositiveGets404WithoutLookingItUp(): void
    {
        $this->access->expects($this->never())->method('forUser');

        $this->assertSame(404, $this->controller->show(0)->getStatus());
        $this->assertSame(404, $this->controller->show(-3)->getStatus());
    }

    public function testNoSignedInUserGets404ToRead(): void
    {
        $anonymous = $this->createMock(IUserSession::class);
        $anonymous->method('getUser')->willReturn(null);
        $this->access->expects($this->never())->method('forUser');

        $this->assertSame(404, $this->buildController($anonymous)->show(7)->getStatus());
    }

    public function testNoSignedInUserGets401ToWrite(): void
    {
        $anonymous = $this->createMock(IUserSession::class);
        $anonymous->method('getUser')->willReturn(null);
        $this->stats->expects($this->never())->method('store');

        $this->assertSame(401, $this->buildController($anonymous)->store(7, '"e1"', ['v' => 1])->getStatus());
    }

    public function testStoresForTheCurrentVersion(): void
    {
        $this->grant(true);
        $this->stats->expects($this->once())->method('store')->with(7, '"e1"', ['v' => 1], 'alice')->willReturn(ModelStatsStoreResult::Stored);

        $response = $this->controller->store(7, '"e1"', ['v' => 1]);

        $this->assertSame(201, $response->getStatus());
        $this->assertSame(['status' => 'stored'], $response->getData());
    }

    public function testSomeoneWhoCanOnlyReadIsRefusedAndStoresNothing(): void
    {
        $this->grant(false);
        $this->stats->expects($this->never())->method('store');

        $response = $this->controller->store(7, '"e1"', ['v' => 1]);

        $this->assertSame(403, $response->getStatus());
    }

    public function testSomeoneWhoCanOnlyReadStillReadsTheNumbers(): void
    {
        $this->grant(false);
        $this->stats->method('get')->willReturn(['v' => 1]);
        $this->settings->method('settings')->willReturn(['unit' => null, 'up' => null]);

        $this->assertSame(['v' => 1], $this->controller->show(7)->getData()['stats']);
    }

    public function testTheRefusalForSomeoneWhoCannotEditAnswersTheSameAsForAThumbnail(): void
    {
        // ThumbnailController::storeThumbnail answers 403 'You cannot update this file'
        $this->grant(false);

        $this->assertSame('You cannot update this file', $this->controller->store(7, '"e1"', ['v' => 1])->getData()['error']);
    }

    public function testANumberMeasuredFromAnEarlierVersionIsRefused(): void
    {
        $this->grant(true, 'a.stl', '"e2"');
        $this->stats->expects($this->never())->method('store');

        $response = $this->controller->store(7, '"e1"', ['v' => 1]);

        $this->assertSame(412, $response->getStatus());
        $this->assertSame(['status' => 'stale'], $response->getData());
    }

    public function testTheEtagIsRequired(): void
    {
        $this->grant(true);
        $this->stats->expects($this->never())->method('store');

        $this->assertSame(400, $this->controller->store(7, '', ['v' => 1])->getStatus());
    }

    public function testAVersionThatHasNumbersAlreadyGives409(): void
    {
        $this->grant(true);
        $this->stats->method('store')->willReturn(ModelStatsStoreResult::Exists);

        $response = $this->controller->store(7, '"e1"', ['v' => 1]);

        $this->assertSame(409, $response->getStatus());
        $this->assertSame(['status' => 'exists'], $response->getData());
    }

    public function testNumbersTheServiceRefusesGive400(): void
    {
        $this->grant(true);
        $this->stats->method('store')->willReturn(ModelStatsStoreResult::Invalid);

        $this->assertSame(400, $this->controller->store(7, '"e1"', ['v' => 9])->getStatus());
    }

    public function testABodyOverTheCapIsRefusedBeforeItIsRead(): void
    {
        $this->grant(true);
        $this->request->method('getHeader')->with('Content-Length')->willReturn('9000');
        $this->stats->expects($this->never())->method('store');

        $this->assertSame(413, $this->controller->store(7, '"e1"', ['v' => 1])->getStatus());
    }

    public function testADatabaseFailureOnWriteGives500WithoutDetails(): void
    {
        $this->grant(true);
        $this->stats->method('store')->willThrowException(new \RuntimeException('SQLSTATE secret'));

        $response = $this->controller->store(7, '"e1"', ['v' => 1]);

        $this->assertSame(500, $response->getStatus());
        $this->assertStringNotContainsString('secret', (string) json_encode($response->getData()));
    }

    public function testAFailureOnReadGives500WithoutDetails(): void
    {
        $this->grant(true);
        $this->stats->method('get')->willThrowException(new \RuntimeException('SQLSTATE secret'));

        $response = $this->controller->show(7);

        $this->assertSame(500, $response->getStatus());
        $this->assertStringNotContainsString('secret', (string) json_encode($response->getData()));
    }

    public function testNoRouteSkipsTheCsrfCheck(): void
    {
        foreach (['show', 'store'] as $method) {
            $reflection = new \ReflectionMethod(ModelStatsController::class, $method);

            $this->assertSame([], $reflection->getAttributes(NoCSRFRequired::class), $method);
            $this->assertNotSame([], $reflection->getAttributes(NoAdminRequired::class), $method);
        }
    }
}
