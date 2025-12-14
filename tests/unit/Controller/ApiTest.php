<?php

declare(strict_types=1);

namespace Controller;

use OCA\ThreeDViewer\Controller\ApiController;
use OCP\Files\IRootFolder;
use OCP\IRequest;
use OCP\IUserSession;
use PHPUnit\Framework\TestCase;

final class ApiTest extends TestCase
{
    public function testIndex(): void
    {
        $request = $this->createMock(IRequest::class);
        $rootFolder = $this->createMock(IRootFolder::class);
        $userSession = $this->createMock(IUserSession::class);

        $controller = new ApiController($request, $rootFolder, $userSession);

        $this->assertEquals($controller->index()->getData()['message'], 'Hello world!');
    }
}
