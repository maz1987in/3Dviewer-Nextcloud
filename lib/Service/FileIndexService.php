<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use DateTime;
use OCA\ThreeDViewer\Db\FileIndex;
use OCA\ThreeDViewer\Db\FileIndexMapper;
use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\Files\Node;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;

class FileIndexService
{
	public function __construct(
		private readonly FileIndexMapper $fileIndexMapper,
		private readonly IRootFolder $rootFolder,
		private readonly IUserSession $userSession,
		private readonly ModelFileSupport $modelFileSupport,
		private readonly LoggerInterface $logger,
	) {
	}

	/**
	 * Index a file
	 */
	public function indexFile(File $file, string $userId): void
	{
		try {
			$extension = strtolower($file->getExtension());
			if (!$this->modelFileSupport->isSupported($extension)) {
				return;
			}

			// Check if already indexed
			$existing = $this->fileIndexMapper->getByFileId($file->getId(), $userId);
			$fileIndex = $existing ?? new FileIndex();

			// Extract folder path
			$path = $file->getPath();
			$userFolder = $this->rootFolder->getUserFolder($userId);
			$userFolderPath = $userFolder->getPath();
			
			// Remove user folder path from file path to get relative path
			if (str_starts_with($path, $userFolderPath)) {
				$relativePath = substr($path, strlen($userFolderPath) + 1);
			} else {
				$relativePath = $path;
			}

			// Extract folder path (parent directory)
			$pathParts = explode('/', $relativePath);
			array_pop($pathParts); // Remove filename
			$folderPath = !empty($pathParts) ? implode('/', $pathParts) : '';

			// Extract year and month from mtime
			$mtime = $file->getMTime();
			$dateTime = new DateTime('@' . $mtime);
			$year = (int)$dateTime->format('Y');
			$month = (int)$dateTime->format('n'); // 1-12 without leading zeros

			$fileIndex->setFileId($file->getId());
			$fileIndex->setUserId($userId);
			$fileIndex->setName($file->getName());
			$fileIndex->setPath($relativePath);
			$fileIndex->setFolderPath($folderPath);
			$fileIndex->setFolderPathHash($this->hashFolderPath($folderPath));
			$fileIndex->setExtension($extension);
			$fileIndex->setMtime($mtime);
			$fileIndex->setSize($file->getSize());
			$fileIndex->setYear($year);
			$fileIndex->setMonth($month);
			$fileIndex->setIndexedAt(time());

			if ($existing !== null) {
				$this->fileIndexMapper->update($fileIndex);
			} else {
				$this->fileIndexMapper->insert($fileIndex);
			}
		} catch (\Throwable $e) {
			$this->logger->error('Failed to index file: ' . $e->getMessage(), [
				'file_id' => $file->getId(),
				'user_id' => $userId,
				'exception' => $e,
			]);
		}
	}

	/**
	 * Remove file from index
	 */
	public function removeFile(int $fileId, string $userId): void
	{
		try {
			$this->fileIndexMapper->deleteByFileId($fileId, $userId);
		} catch (\Throwable $e) {
			$this->logger->error('Failed to remove file from index: ' . $e->getMessage(), [
				'file_id' => $fileId,
				'user_id' => $userId,
				'exception' => $e,
			]);
		}
	}

	/**
	 * Reindex all files for a user
	 */
	public function reindexUser(string $userId): void
	{
		try {
			// Clear existing index
			$this->fileIndexMapper->deleteByUser($userId);

			// Get user folder
			$userFolder = $this->rootFolder->getUserFolder($userId);

			// Recursively index all 3D files
			$this->indexFolder($userFolder, $userId);
		} catch (\Throwable $e) {
			$this->logger->error('Failed to reindex user files: ' . $e->getMessage(), [
				'user_id' => $userId,
				'exception' => $e,
			]);
		}
	}

	/**
	 * Recursively index files in a folder
	 */
	private function indexFolder(\OCP\Files\Folder $folder, string $userId): void
	{
		try {
			$children = $folder->getDirectoryListing();

			foreach ($children as $node) {
				if ($node instanceof File) {
					$this->indexFile($node, $userId);
				} elseif ($node instanceof \OCP\Files\Folder) {
					$this->indexFolder($node, $userId);
				}
			}
		} catch (\Throwable $e) {
			$this->logger->error('Failed to index folder: ' . $e->getMessage(), [
				'folder_path' => $folder->getPath(),
				'user_id' => $userId,
				'exception' => $e,
			]);
		}
	}

	private function hashFolderPath(string $folderPath): string
	{
		return hash('sha256', $folderPath);
	}
}

