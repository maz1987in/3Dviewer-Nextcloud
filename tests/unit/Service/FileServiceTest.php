<?php

declare(strict_types=1);

namespace Service;

use OCA\ThreeDViewer\Service\FileService;
use OCP\Files\File;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\Exception\UnsupportedFileTypeException;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\IUser;
use OCP\IUserSession;
use PHPUnit\Framework\TestCase;
use RuntimeException;

final class FileServiceTest extends TestCase {
	private $rootFolder;
	private $userSession;
	private $user;
    private $userFolder;

	protected function setUp(): void {
		parent::setUp();
		// Skip tests gracefully if OCP interfaces are incomplete (standalone mode)
		if (!interface_exists(IRootFolder::class)) {
			$this->markTestSkipped('OCP interfaces not available in isolated environment.');
		}
		$this->rootFolder = $this->createMock(IRootFolder::class);
		$this->userSession = $this->createMock(IUserSession::class);
		$this->user = $this->createMock(IUser::class);
		// userFolder uses dynamic class implementing needed methods via anonymous class when mocking becomes problematic
		$this->userFolder = $this->getMockBuilder(IRootFolder::class)->disableOriginalConstructor()->getMock();
	}

	public function testGetValidatedFileNoUser(): void {
		$this->userSession->method('getUser')->willReturn(null);
		$support = $this->createMock(ModelFileSupport::class);
		$service = new FileService($this->rootFolder, $this->userSession, $support);
		$this->expectException(RuntimeException::class);
		$service->getValidatedFile(123);
	}

	public function testGetValidatedFileNotFound(): void {
		$this->userSession->method('getUser')->willReturn($this->user);
		$this->user->method('getUID')->willReturn('uid');
		$this->rootFolder->method('getUserFolder')->willReturn($this->userFolder);
		$this->userFolder->method('getById')->willReturn([]);
		$support = $this->createMock(ModelFileSupport::class);
		$service = new FileService($this->rootFolder, $this->userSession, $support);
		$this->expectException(NotFoundException::class);
		$service->getValidatedFile(22);
	}

	public function testGetValidatedFileUnsupported(): void {
		$this->userSession->method('getUser')->willReturn($this->user);
		$this->user->method('getUID')->willReturn('uid');
		$this->rootFolder->method('getUserFolder')->willReturn($this->userFolder);
		$file = $this->createMock(File::class);
		$file->method('getExtension')->willReturn('txt');
		$this->userFolder->method('getById')->willReturn([$file]);
		$support = $this->createMock(ModelFileSupport::class);
		$support->method('isSupported')->willReturn(false);
		$service = new FileService($this->rootFolder, $this->userSession, $support);
		$this->expectException(UnsupportedFileTypeException::class);
		$service->getValidatedFile(55);
	}
}
