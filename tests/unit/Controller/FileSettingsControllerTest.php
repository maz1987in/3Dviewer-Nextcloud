<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Controller;

use OCA\ThreeDViewer\Controller\FileSettingsController;
use OCA\ThreeDViewer\Service\Exception\InvalidFileSettingException;
use OCA\ThreeDViewer\Service\FileSettingsService;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\NoteAccess;
use OCA\ThreeDViewer\Service\NoteAccessResult;
use OCA\ThreeDViewer\Service\ResponseBuilder;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\ICache;
use OCP\ICacheFactory;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserSession;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class FileSettingsControllerTest extends TestCase
{
    private NoteAccess&MockObject $access;
    private FileSettingsService&MockObject $settings;
    private FileSettingsController $controller;
    private IRequest&MockObject $request;

    protected function setUp(): void
    {
        $this->access = $this->createMock(NoteAccess::class);
        $this->settings = $this->createMock(FileSettingsService::class);

        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('alice');
        $session = $this->createMock(IUserSession::class);
        $session->method('getUser')->willReturn($user);

        $cacheFactory = $this->createMock(ICacheFactory::class);
        $cacheFactory->method('createDistributed')->willReturn($this->createMock(ICache::class));

        $this->request = $this->createMock(IRequest::class);
        $this->controller = new FileSettingsController(
            'threedviewer',
            $this->request,
            $session,
            $this->access,
            $this->settings,
            new ResponseBuilder($this->createMock(ModelFileSupport::class)),
            $this->createMock(ModelFileSupport::class),
            $this->createMock(LoggerInterface::class),
            $cacheFactory,
        );
    }

    public function testNoRouteOptsOutOfCsrf(): void
    {
        foreach ((new \ReflectionClass(FileSettingsController::class))->getMethods(\ReflectionMethod::IS_PUBLIC) as $method) {
            $this->assertSame([], $method->getAttributes(NoCSRFRequired::class), $method->getName() . ' must require the CSRF token');
        }
    }

    public function testInaccessibleFileIs404ForBothRoutes(): void
    {
        $this->access->method('forUser')->willReturn(null);
        $this->settings->expects($this->never())->method('setUnit');

        $this->assertSame(404, $this->controller->show(7)->getStatus());
        $this->assertSame(404, $this->controller->update(7, 'in')->getStatus());
        $this->assertSame(404, $this->controller->show(0)->getStatus());
    }

    public function testReadReturnsTheUnitAndTheCallersRights(): void
    {
        $this->access->method('forUser')->with(7, 'alice')->willReturn(new NoteAccessResult(false, 'model.stl'));
        $this->settings->method('unit')->with(7)->willReturn('in');

        $response = $this->controller->show(7);

        $this->assertSame(200, $response->getStatus());
        $this->assertSame(['canEdit' => false, 'unit' => 'in'], $response->getData());
    }

    public function testAViewOnlyUserCannotSave(): void
    {
        $this->access->method('forUser')->willReturn(new NoteAccessResult(false, 'model.stl'));
        $this->settings->expects($this->never())->method('setUnit');

        $response = $this->controller->update(7, 'in');

        $this->assertSame(403, $response->getStatus());
        $this->assertSame(['error' => 'This model is view-only for you'], $response->getData());
    }

    public function testAnEditorSaves(): void
    {
        $this->request->method('getParams')->willReturn(['fileId' => '7', 'unit' => 'in']);
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true, 'model.stl'));
        $this->settings->expects($this->once())->method('setUnit')->with(7, 'model.stl', 'in', 'alice')->willReturn('in');

        $response = $this->controller->update(7, 'in');

        $this->assertSame(200, $response->getStatus());
        $this->assertSame(['canEdit' => true, 'unit' => 'in'], $response->getData());
    }

    public function testAnInvalidUnitIs400(): void
    {
        $this->request->method('getParams')->willReturn(['unit' => 'furlong']);
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true, 'model.stl'));
        $this->settings->method('setUnit')->willThrowException(new InvalidFileSettingException('Unknown unit'));

        $response = $this->controller->update(7, 'furlong');

        $this->assertSame(400, $response->getStatus());
        $this->assertSame(['error' => 'Unknown unit'], $response->getData());
    }

    /** Clearing the unit is an explicit `null`; a body without the field is a mistake. */
    public function testASaveWithoutAUnitIs400(): void
    {
        $this->request->method('getParams')->willReturn(['fileId' => '7']);
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true, 'model.stl'));
        $this->settings->expects($this->never())->method('setUnit');

        $response = $this->controller->update(7);

        $this->assertSame(400, $response->getStatus());
        $this->assertSame(['error' => 'No unit given'], $response->getData());
    }

    public function testAnExplicitNullClearsTheUnit(): void
    {
        $this->request->method('getParams')->willReturn(['fileId' => '7', 'unit' => null]);
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true, 'model.stl'));
        $this->settings->expects($this->once())->method('setUnit')->with(7, 'model.stl', null, 'alice')->willReturn(null);

        $this->assertSame(['canEdit' => true, 'unit' => null], $this->controller->update(7, null)->getData());
    }
}
