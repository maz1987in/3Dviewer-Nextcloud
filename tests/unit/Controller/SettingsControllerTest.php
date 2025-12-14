<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Controller;

use OCA\ThreeDViewer\Controller\SettingsController;
use OCP\AppFramework\Http\DataResponse;
use OCP\IConfig;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserSession;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class SettingsControllerTest extends TestCase
{
    /** @var IRequest&MockObject */
    private $request;
    /** @var IConfig&MockObject */
    private $config;
    /** @var IUserSession&MockObject */
    private $userSession;
    /** @var IUser&MockObject */
    private $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->request = $this->createMock(IRequest::class);
        $this->config = $this->createMock(IConfig::class);
        $this->userSession = $this->createMock(IUserSession::class);
        $this->user = $this->createMock(IUser::class);
        $this->user->method('getUID')->willReturn('testuser');
        $this->userSession->method('getUser')->willReturn($this->user);
    }

    public function testGetSettingsReturnsEmptyArrayWhenNoSettings(): void
    {
        $this->config->method('getUserValue')
            ->with('testuser', 'threedviewer', 'user_preferences', '{}')
            ->willReturn('{}');

        $controller = new SettingsController('threedviewer', $this->request, $this->config, $this->userSession);
        $response = $controller->getSettings();

        $this->assertInstanceOf(DataResponse::class, $response);
        $data = $response->getData();
        $this->assertIsArray($data);
        $this->assertArrayHasKey('settings', $data);
        $this->assertIsArray($data['settings']);
        $this->assertEmpty($data['settings']);
    }

    public function testGetSettingsReturnsSavedSettings(): void
    {
        $savedSettings = ['theme' => 'dark', 'autoRotate' => true];
        $this->config->method('getUserValue')
            ->with('testuser', 'threedviewer', 'user_preferences', '{}')
            ->willReturn(json_encode($savedSettings));

        $controller = new SettingsController('threedviewer', $this->request, $this->config, $this->userSession);
        $response = $controller->getSettings();

        $data = $response->getData();
        $this->assertEquals($savedSettings, $data['settings']);
    }

    public function testGetSettingsHandlesInvalidJson(): void
    {
        $this->config->method('getUserValue')
            ->with('testuser', 'threedviewer', 'user_preferences', '{}')
            ->willReturn('invalid json');

        $controller = new SettingsController('threedviewer', $this->request, $this->config, $this->userSession);
        $response = $controller->getSettings();

        $data = $response->getData();
        $this->assertIsArray($data['settings']);
        $this->assertEmpty($data['settings']); // Should default to empty array
    }

    public function testSaveSettingsStoresValidSettings(): void
    {
        $settings = ['theme' => 'dark', 'autoRotate' => true, 'grid' => false];

        $this->request->method('getParam')
            ->with('settings')
            ->willReturn($settings);

        $this->config->expects($this->once())
            ->method('setUserValue')
            ->with('testuser', 'threedviewer', 'user_preferences', json_encode($settings));

        $controller = new SettingsController('threedviewer', $this->request, $this->config, $this->userSession);
        $response = $controller->saveSettings();

        $this->assertInstanceOf(DataResponse::class, $response);
        $data = $response->getData();
        $this->assertIsArray($data);
    }

    public function testSaveSettingsHandlesNullParam(): void
    {
        $this->request->method('getParam')
            ->with('settings')
            ->willReturn(null);

        $this->config->expects($this->once())
            ->method('setUserValue')
            ->with('testuser', 'threedviewer', 'user_preferences', json_encode([]));

        $controller = new SettingsController('threedviewer', $this->request, $this->config, $this->userSession);
        $response = $controller->saveSettings();

        $this->assertInstanceOf(DataResponse::class, $response);
    }

    public function testSaveSettingsHandlesNonArrayParam(): void
    {
        $this->request->method('getParam')
            ->with('settings')
            ->willReturn('not an array');

        $this->config->expects($this->once())
            ->method('setUserValue')
            ->with('testuser', 'threedviewer', 'user_preferences', json_encode([]));

        $controller = new SettingsController('threedviewer', $this->request, $this->config, $this->userSession);
        $response = $controller->saveSettings();

        $this->assertInstanceOf(DataResponse::class, $response);
    }

    public function testResetSettingsDeletesUserValue(): void
    {
        $this->config->expects($this->once())
            ->method('deleteUserValue')
            ->with('testuser', 'threedviewer', 'user_preferences');

        $controller = new SettingsController('threedviewer', $this->request, $this->config, $this->userSession);
        $response = $controller->resetSettings();

        $this->assertInstanceOf(DataResponse::class, $response);
        $data = $response->getData();
        $this->assertIsArray($data);
    }
}
