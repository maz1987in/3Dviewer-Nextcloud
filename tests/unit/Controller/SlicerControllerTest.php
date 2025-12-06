<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Controller;

use OCA\ThreeDViewer\Controller\SlicerController;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\DataDownloadResponse;
use OCP\AppFramework\Http\JSONResponse;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserSession;
use OCP\IURLGenerator;
use OCP\Share\IManager as ShareManager;
use OCP\Share\IShare;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class SlicerControllerTest extends TestCase
{
	/** @var IRequest&MockObject */
	private $request;
	/** @var IRootFolder&MockObject */
	private $rootFolder;
	/** @var IUserSession&MockObject */
	private $userSession;
	/** @var IURLGenerator&MockObject */
	private $urlGenerator;
	/** @var ShareManager&MockObject */
	private $shareManager;
	/** @var LoggerInterface&MockObject */
	private $logger;
	/** @var IUser&MockObject */
	private $user;
	/** @var Folder&MockObject */
	private $userFolder;
	/** @var Folder&MockObject */
	private $tempFolder;

	protected function setUp(): void
	{
		parent::setUp();
		$this->request = $this->createMock(IRequest::class);
		$this->rootFolder = $this->createMock(IRootFolder::class);
		$this->userSession = $this->createMock(IUserSession::class);
		$this->urlGenerator = $this->createMock(IURLGenerator::class);
		$this->shareManager = $this->createMock(ShareManager::class);
		$this->logger = $this->createMock(LoggerInterface::class);
		$this->user = $this->createMock(IUser::class);
		$this->userFolder = $this->createMock(Folder::class);
		$this->tempFolder = $this->createMock(Folder::class);

		$this->user->method('getUID')->willReturn('testuser');
		// Default: authenticated user (can be overridden in individual tests)
		$this->userSession->method('getUser')->willReturn($this->user);
		$this->rootFolder->method('getUserFolder')->with('testuser')->willReturn($this->userFolder);
	}

	public function testTestEndpointReturnsOk(): void
	{
		$controller = new SlicerController(
			'threedviewer',
			$this->request,
			$this->rootFolder,
			$this->userSession,
			$this->urlGenerator,
			$this->shareManager,
			$this->logger
		);

		$response = $controller->test();

		$this->assertInstanceOf(JSONResponse::class, $response);
		$data = $response->getData();
		$this->assertEquals('ok', $data['status']);
		$this->assertArrayHasKey('timestamp', $data);
	}

	public function testSaveTempFileRequiresAuthentication(): void
	{
		// Override the default getUser() expectation from setUp()
		$this->userSession = $this->createMock(IUserSession::class);
		$this->userSession->expects($this->once())
			->method('getUser')
			->willReturn(null);

		$controller = new SlicerController(
			'threedviewer',
			$this->request,
			$this->rootFolder,
			$this->userSession,
			$this->urlGenerator,
			$this->shareManager,
			$this->logger
		);

		$response = $controller->saveTempFile();

		$this->assertInstanceOf(JSONResponse::class, $response);
		$this->assertEquals(Http::STATUS_UNAUTHORIZED, $response->getStatus());
		$data = $response->getData();
		$this->assertArrayHasKey('error', $data);
	}

	public function testSaveTempFileRequiresFileData(): void
	{
		// Note: This test is difficult to fully test because saveTempFile uses
		// file_get_contents('php://input') which cannot be easily mocked.
		// The controller checks authentication first, then file data.
		// This test verifies the structure is correct.
		// In a real scenario, empty php://input would return empty string.
		
		// Since we can't mock php://input, we'll skip this test
		// or test it at integration level
		$this->markTestSkipped('Cannot mock php://input stream. Test at integration level.');
	}

	public function testSaveTempFileCreatesTempFolderIfNotExists(): void
	{
		// Note: This test cannot be fully unit tested because saveTempFile uses
		// file_get_contents('php://input') which cannot be mocked in unit tests.
		// This functionality should be tested at the integration level.
		// The test structure below shows what would be tested if we could mock the input stream.
		
		$this->markTestSkipped('Cannot mock php://input stream. Test at integration level.');
		
		// Structure for integration test:
		// 1. Mock temp folder not existing -> throws NotFoundException
		// 2. Mock creating new temp folder -> returns tempFolder
		// 3. Mock file creation -> returns file
		// 4. Mock share creation -> returns share with token
		// 5. Verify file content is saved and share is created
	}

	public function testGetTempFileRequiresAuthentication(): void
	{
		// Override the default getUser() expectation from setUp()
		$this->userSession = $this->createMock(IUserSession::class);
		$this->userSession->expects($this->once())
			->method('getUser')
			->willReturn(null);

		$controller = new SlicerController(
			'threedviewer',
			$this->request,
			$this->rootFolder,
			$this->userSession,
			$this->urlGenerator,
			$this->shareManager,
			$this->logger
		);

		$response = $controller->getTempFile(123);

		$this->assertInstanceOf(JSONResponse::class, $response);
		// The method checks user first, so if null, it returns 401
		$this->assertEquals(Http::STATUS_UNAUTHORIZED, $response->getStatus());
	}

	public function testGetTempFileReturnsNotFoundForInvalidFileId(): void
	{
		$this->userFolder->method('getById')
			->with(999)
			->willReturn([]);

		$controller = new SlicerController(
			'threedviewer',
			$this->request,
			$this->rootFolder,
			$this->userSession,
			$this->urlGenerator,
			$this->shareManager,
			$this->logger
		);

		$response = $controller->getTempFile(999);

		$this->assertInstanceOf(JSONResponse::class, $response);
		$this->assertEquals(Http::STATUS_NOT_FOUND, $response->getStatus());
	}

	public function testGetTempFileRejectsFilesOutsideTempFolder(): void
	{
		$file = $this->createMock(File::class);
		$file->method('getPath')->willReturn('/testuser/regular/file.stl');

		$this->userFolder->method('getById')
			->with(123)
			->willReturn([$file]);

		$controller = new SlicerController(
			'threedviewer',
			$this->request,
			$this->rootFolder,
			$this->userSession,
			$this->urlGenerator,
			$this->shareManager,
			$this->logger
		);

		$response = $controller->getTempFile(123);

		$this->assertInstanceOf(JSONResponse::class, $response);
		$this->assertEquals(Http::STATUS_FORBIDDEN, $response->getStatus());
	}

	public function testGetTempFileReturnsFileContent(): void
	{
		$fileContent = 'STL file content';
		$file = $this->createMock(File::class);
		$file->method('getPath')->willReturn('/testuser/.3dviewer_temp/file.stl');
		$file->method('getName')->willReturn('file.stl');
		$file->method('getContent')->willReturn($fileContent);

		$this->userFolder->method('getById')
			->with(123)
			->willReturn([$file]);

		$controller = new SlicerController(
			'threedviewer',
			$this->request,
			$this->rootFolder,
			$this->userSession,
			$this->urlGenerator,
			$this->shareManager,
			$this->logger
		);

		$response = $controller->getTempFile(123);

		$this->assertInstanceOf(DataDownloadResponse::class, $response);
		$this->assertEquals($fileContent, $response->render());
	}

	public function testDeleteTempFileRequiresAuthentication(): void
	{
		// Override the default getUser() expectation from setUp()
		$this->userSession = $this->createMock(IUserSession::class);
		$this->userSession->expects($this->once())
			->method('getUser')
			->willReturn(null);

		$controller = new SlicerController(
			'threedviewer',
			$this->request,
			$this->rootFolder,
			$this->userSession,
			$this->urlGenerator,
			$this->shareManager,
			$this->logger
		);

		$response = $controller->deleteTempFile(123);

		$this->assertInstanceOf(JSONResponse::class, $response);
		// The method checks user first, so if null, it returns 401
		$this->assertEquals(Http::STATUS_UNAUTHORIZED, $response->getStatus());
	}

	public function testDeleteTempFileDeletesFileAndShares(): void
	{
		$file = $this->createMock(File::class);
		$file->method('getPath')->willReturn('/testuser/.3dviewer_temp/file.stl');

		$this->userFolder->method('getById')
			->with(123)
			->willReturn([$file]);

		// Mock share deletion
		$share = $this->createMock(IShare::class);
		$share->method('getToken')->willReturn('test-token');
		$this->shareManager->method('getSharesBy')
			->willReturn([$share]);
		$this->shareManager->expects($this->once())
			->method('deleteShare')
			->with($share);

		// Mock file deletion
		$file->expects($this->once())->method('delete');

		$controller = new SlicerController(
			'threedviewer',
			$this->request,
			$this->rootFolder,
			$this->userSession,
			$this->urlGenerator,
			$this->shareManager,
			$this->logger
		);

		$response = $controller->deleteTempFile(123);

		$this->assertInstanceOf(JSONResponse::class, $response);
		$data = $response->getData();
		$this->assertTrue($data['success']);
	}

	public function testDeleteTempFileReturnsSuccessIfFileNotFound(): void
	{
		$this->userFolder->method('getById')
			->with(999)
			->willReturn([]);

		$controller = new SlicerController(
			'threedviewer',
			$this->request,
			$this->rootFolder,
			$this->userSession,
			$this->urlGenerator,
			$this->shareManager,
			$this->logger
		);

		$response = $controller->deleteTempFile(999);

		$this->assertInstanceOf(JSONResponse::class, $response);
		$data = $response->getData();
		$this->assertTrue($data['success']); // Should return success if already deleted
	}
}

