<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Db\FileIndex;
use OCA\ThreeDViewer\Db\FileIndexMapper;
use OCA\ThreeDViewer\Service\FileIndexService;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\IUserSession;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class FileIndexServiceTest extends TestCase
{
	/** @var FileIndexMapper&MockObject */
	private $fileIndexMapper;
	/** @var IRootFolder&MockObject */
	private $rootFolder;
	/** @var IUserSession&MockObject */
	private $userSession;
	/** @var ModelFileSupport&MockObject */
	private $modelFileSupport;
	/** @var LoggerInterface&MockObject */
	private $logger;
	/** @var Folder&MockObject */
	private $userFolder;

	protected function setUp(): void
	{
		parent::setUp();
		$this->fileIndexMapper = $this->createMock(FileIndexMapper::class);
		$this->rootFolder = $this->createMock(IRootFolder::class);
		$this->userSession = $this->createMock(IUserSession::class);
		$this->modelFileSupport = $this->createMock(ModelFileSupport::class);
		$this->logger = $this->createMock(LoggerInterface::class);
		$this->userFolder = $this->createMock(Folder::class);

		$this->rootFolder->method('getUserFolder')
			->with('testuser')
			->willReturn($this->userFolder);
	}

	public function testIndexFileSkipsUnsupportedFormats(): void
	{
		$file = $this->createMock(File::class);
		$file->method('getExtension')->willReturn('txt');

		$this->modelFileSupport->method('isSupported')
			->with('txt')
			->willReturn(false);

		$this->fileIndexMapper->expects($this->never())
			->method('insert');
		$this->fileIndexMapper->expects($this->never())
			->method('update');

		$service = new FileIndexService(
			$this->fileIndexMapper,
			$this->rootFolder,
			$this->userSession,
			$this->modelFileSupport,
			$this->logger
		);

		$service->indexFile($file, 'testuser');
	}

	public function testIndexFileInsertsNewFile(): void
	{
		$fileId = 123;
		$userId = 'testuser';
		$fileName = 'model.obj';
		$filePath = '/testuser/models/model.obj';
		$fileSize = 1024;
		$mtime = 1609459200; // 2021-01-01 00:00:00

		$file = $this->createMock(File::class);
		$file->method('getId')->willReturn($fileId);
		$file->method('getExtension')->willReturn('obj');
		$file->method('getName')->willReturn($fileName);
		$file->method('getPath')->willReturn($filePath);
		$file->method('getSize')->willReturn($fileSize);
		$file->method('getMTime')->willReturn($mtime);

		$this->modelFileSupport->method('isSupported')
			->with('obj')
			->willReturn(true);

		$this->userFolder->method('getPath')->willReturn('/testuser');

		$this->fileIndexMapper->method('getByFileId')
			->with($fileId, $userId)
			->willReturn(null);

		$this->fileIndexMapper->expects($this->once())
			->method('insert')
			->with($this->callback(function (FileIndex $index) use ($fileId, $userId, $fileName) {
				return $index->getFileId() === $fileId
					&& $index->getUserId() === $userId
					&& $index->getName() === $fileName
					&& $index->getExtension() === 'obj'
					&& $index->getYear() === 2021
					&& $index->getMonth() === 1;
			}));

		$service = new FileIndexService(
			$this->fileIndexMapper,
			$this->rootFolder,
			$this->userSession,
			$this->modelFileSupport,
			$this->logger
		);

		$service->indexFile($file, $userId);
	}

	public function testIndexFileUpdatesExistingFile(): void
	{
		$fileId = 123;
		$userId = 'testuser';
		$existingIndex = new FileIndex();
		$existingIndex->setFileId($fileId);
		$existingIndex->setUserId($userId);

		$file = $this->createMock(File::class);
		$file->method('getId')->willReturn($fileId);
		$file->method('getExtension')->willReturn('obj');
		$file->method('getName')->willReturn('model.obj');
		$file->method('getPath')->willReturn('/testuser/models/model.obj');
		$file->method('getSize')->willReturn(2048);
		$file->method('getMTime')->willReturn(1609459200);

		$this->modelFileSupport->method('isSupported')
			->with('obj')
			->willReturn(true);

		$this->userFolder->method('getPath')->willReturn('/testuser');

		$this->fileIndexMapper->method('getByFileId')
			->with($fileId, $userId)
			->willReturn($existingIndex);

		$this->fileIndexMapper->expects($this->once())
			->method('update')
			->with($this->callback(function (FileIndex $index) use ($fileId) {
				return $index->getFileId() === $fileId;
			}));

		$service = new FileIndexService(
			$this->fileIndexMapper,
			$this->rootFolder,
			$this->userSession,
			$this->modelFileSupport,
			$this->logger
		);

		$service->indexFile($file, $userId);
	}

	public function testIndexFileExtractsFolderPath(): void
	{
		$file = $this->createMock(File::class);
		$file->method('getId')->willReturn(123);
		$file->method('getExtension')->willReturn('obj');
		$file->method('getName')->willReturn('model.obj');
		$file->method('getPath')->willReturn('/testuser/folder/subfolder/model.obj');
		$file->method('getSize')->willReturn(1024);
		$file->method('getMTime')->willReturn(1609459200);

		$this->modelFileSupport->method('isSupported')->willReturn(true);
		$this->userFolder->method('getPath')->willReturn('/testuser');
		$this->fileIndexMapper->method('getByFileId')->willReturn(null);

		$this->fileIndexMapper->expects($this->once())
			->method('insert')
			->with($this->callback(function (FileIndex $index) {
				return $index->getFolderPath() === 'folder/subfolder'
					&& $index->getPath() === 'folder/subfolder/model.obj';
			}));

		$service = new FileIndexService(
			$this->fileIndexMapper,
			$this->rootFolder,
			$this->userSession,
			$this->modelFileSupport,
			$this->logger
		);

		$service->indexFile($file, 'testuser');
	}

	public function testRemoveFileDeletesFromIndex(): void
	{
		$fileId = 123;
		$userId = 'testuser';

		$this->fileIndexMapper->expects($this->once())
			->method('deleteByFileId')
			->with($fileId, $userId);

		$service = new FileIndexService(
			$this->fileIndexMapper,
			$this->rootFolder,
			$this->userSession,
			$this->modelFileSupport,
			$this->logger
		);

		$service->removeFile($fileId, $userId);
	}

	public function testReindexUserClearsAndRebuildsIndex(): void
	{
		$userId = 'testuser';

		// Mock clearing existing index
		$this->fileIndexMapper->expects($this->once())
			->method('deleteByUser')
			->with($userId);

		// Mock folder structure - need to mock Folder interface properly
		$file1 = $this->createMock(File::class);
		$file1->method('getId')->willReturn(1);
		$file1->method('getExtension')->willReturn('obj');
		$file1->method('getName')->willReturn('file1.obj');
		$file1->method('getPath')->willReturn('/testuser/file1.obj');
		$file1->method('getSize')->willReturn(1024);
		$file1->method('getMTime')->willReturn(1609459200);

		$file2 = $this->createMock(File::class);
		$file2->method('getId')->willReturn(2);
		$file2->method('getExtension')->willReturn('stl');
		$file2->method('getName')->willReturn('file2.stl');
		$file2->method('getPath')->willReturn('/testuser/file2.stl');
		$file2->method('getSize')->willReturn(2048);
		$file2->method('getMTime')->willReturn(1609459200);

		// Mock userFolder as Folder interface
		// The folder name must not start with '.' to avoid being skipped
		// Empty string is fine - it won't match the skip condition
		$userFolder = $this->createMock(Folder::class);
		$userFolder->method('getDirectoryListing')->willReturn([$file1, $file2]);
		$userFolder->method('getPath')->willReturn('/testuser');
		$userFolder->method('getName')->willReturn(''); // Empty name won't be skipped
		$userFolder->method('nodeExists')->with('.no3d')->willReturn(false);

		// Reset rootFolder mock to use the new userFolder
		$this->rootFolder = $this->createMock(IRootFolder::class);
		$this->rootFolder->method('getUserFolder')
			->with($userId)
			->willReturn($userFolder);

		$this->modelFileSupport->method('isSupported')
			->willReturnCallback(function ($ext) {
				return in_array($ext, ['obj', 'stl']);
			});

		$this->fileIndexMapper->method('getByFileId')->willReturn(null);
		$this->fileIndexMapper->expects($this->exactly(2))->method('insert');

		$service = new FileIndexService(
			$this->fileIndexMapper,
			$this->rootFolder,
			$this->userSession,
			$this->modelFileSupport,
			$this->logger
		);

		$service->reindexUser($userId);
	}
}

