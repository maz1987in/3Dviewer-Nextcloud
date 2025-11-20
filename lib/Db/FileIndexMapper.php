<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

class FileIndexMapper extends QBMapper
{
	public function __construct(IDBConnection $db)
	{
		parent::__construct($db, 'tv_file_index', FileIndex::class);
	}

	/**
	 * Get all indexed files for a user
	 * @return FileIndex[]
	 */
	public function getFilesByUser(string $userId): array
	{
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->getTableName())
			->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId, IQueryBuilder::PARAM_STR)));

		return $this->findEntities($qb);
	}

	/**
	 * Get file index by file ID
	 */
	public function getByFileId(int $fileId, string $userId): ?FileIndex
	{
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->getTableName())
			->where($qb->expr()->eq('file_id', $qb->createNamedParameter($fileId, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId, IQueryBuilder::PARAM_STR)));

		try {
			return $this->findEntity($qb);
		} catch (\OCP\AppFramework\Db\DoesNotExistException $e) {
			return null;
		}
	}

	/**
	 * Get files by folder path
	 * @return FileIndex[]
	 */
	public function getFilesByFolder(string $userId, string $folderPath): array
	{
		$folderHash = hash('sha256', $folderPath);
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->getTableName())
			->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId, IQueryBuilder::PARAM_STR)))
			->andWhere($qb->expr()->eq('folder_path_hash', $qb->createNamedParameter($folderHash, IQueryBuilder::PARAM_STR)))
			->andWhere($qb->expr()->eq('folder_path', $qb->createNamedParameter($folderPath, IQueryBuilder::PARAM_STR)));

		return $this->findEntities($qb);
	}

	/**
	 * Get files by extension (type)
	 * @return FileIndex[]
	 */
	public function getFilesByExtension(string $userId, string $extension): array
	{
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->getTableName())
			->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId, IQueryBuilder::PARAM_STR)))
			->andWhere($qb->expr()->eq('extension', $qb->createNamedParameter(strtolower($extension), IQueryBuilder::PARAM_STR)))
			->orderBy('name', 'ASC');

		return $this->findEntities($qb);
	}

	/**
	 * Get files by year and month
	 * @return FileIndex[]
	 */
	public function getFilesByDate(string $userId, ?int $year = null, ?int $month = null): array
	{
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->getTableName())
			->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId, IQueryBuilder::PARAM_STR)));

		if ($year !== null) {
			$qb->andWhere($qb->expr()->eq('year', $qb->createNamedParameter($year, IQueryBuilder::PARAM_INT)));
		}

		if ($month !== null) {
			$qb->andWhere($qb->expr()->eq('month', $qb->createNamedParameter($month, IQueryBuilder::PARAM_INT)));
		}

		$qb->orderBy('mtime', 'DESC');

		return $this->findEntities($qb);
	}

	/**
	 * Get distinct folders that contain 3D files
	 * @return string[]
	 */
	public function getFolders(string $userId, ?string $parentFolder = null): array
	{
		$qb = $this->db->getQueryBuilder();
		$qb->selectDistinct('folder_path')
			->from($this->getTableName())
			->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId, IQueryBuilder::PARAM_STR)));

		if ($parentFolder !== null && $parentFolder !== '') {
			// Get all folders that are descendants of the parent folder
			// This includes nested folders at any depth
			$escapedParent = $qb->escapeLikeParameter($parentFolder);
			$qb->andWhere($qb->expr()->like('folder_path', $qb->createNamedParameter($escapedParent . '/%', IQueryBuilder::PARAM_STR)));
		} else {
			// Get root-level folders (no / in folder_path, meaning single-level folders)
			$qb->andWhere($qb->expr()->notLike('folder_path', $qb->createNamedParameter('%/%', IQueryBuilder::PARAM_STR)))
				->andWhere($qb->expr()->neq('folder_path', $qb->createNamedParameter('', IQueryBuilder::PARAM_STR)));
		}

		$qb->orderBy('folder_path', 'ASC');

		$result = $qb->executeQuery();
		$allFolderPaths = [];
		while ($row = $result->fetch()) {
			$allFolderPaths[] = $row['folder_path'];
		}
		$result->closeCursor();

		// Extract immediate children and intermediate folders
		if ($parentFolder !== null && $parentFolder !== '') {
			return $this->extractImmediateChildren($allFolderPaths, $parentFolder);
		}

		return $allFolderPaths;
	}

	/**
	 * Extract immediate children from a list of folder paths
	 * This includes intermediate folders that don't have files but contain subfolders with files
	 * 
	 * @param string[] $allFolderPaths All folder paths that are descendants of parent
	 * @param string $parentFolder The parent folder path
	 * @return string[] Immediate child folder paths
	 */
	private function extractImmediateChildren(array $allFolderPaths, string $parentFolder): array
	{
		$immediateChildren = [];
		$seenPaths = [];

		foreach ($allFolderPaths as $folderPath) {
			// Remove parent path prefix
			$relativePath = str_replace($parentFolder . '/', '', $folderPath);
			
			// Get the first segment (immediate child)
			$pathParts = explode('/', $relativePath);
			$immediateChildName = $pathParts[0];
			
			// Build the immediate child path
			$immediateChildPath = $parentFolder === '' ? $immediateChildName : $parentFolder . '/' . $immediateChildName;
			
			// Add if not already seen
			if (!in_array($immediateChildPath, $seenPaths, true)) {
				$immediateChildren[] = $immediateChildPath;
				$seenPaths[] = $immediateChildPath;
			}
		}

		// Sort and return
		sort($immediateChildren);
		return $immediateChildren;
	}

	/**
	 * Get distinct extensions (types)
	 * @return string[]
	 */
	public function getExtensions(string $userId): array
	{
		$qb = $this->db->getQueryBuilder();
		$qb->selectDistinct('extension')
			->from($this->getTableName())
			->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId, IQueryBuilder::PARAM_STR)))
			->orderBy('extension', 'ASC');

		$result = $qb->executeQuery();
		$extensions = [];
		while ($row = $result->fetch()) {
			$extensions[] = strtoupper($row['extension']);
		}
		$result->closeCursor();

		return $extensions;
	}

	/**
	 * Get distinct years
	 * @return int[]
	 */
	public function getYears(string $userId): array
	{
		$qb = $this->db->getQueryBuilder();
		$qb->selectDistinct('year')
			->from($this->getTableName())
			->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId, IQueryBuilder::PARAM_STR)))
			->orderBy('year', 'DESC');

		$result = $qb->executeQuery();
		$years = [];
		while ($row = $result->fetch()) {
			$years[] = (int)$row['year'];
		}
		$result->closeCursor();

		return $years;
	}

	/**
	 * Get distinct months for a year
	 * @return int[]
	 */
	public function getMonths(string $userId, int $year): array
	{
		$qb = $this->db->getQueryBuilder();
		$qb->selectDistinct('month')
			->from($this->getTableName())
			->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId, IQueryBuilder::PARAM_STR)))
			->andWhere($qb->expr()->eq('year', $qb->createNamedParameter($year, IQueryBuilder::PARAM_INT)))
			->orderBy('month', 'DESC');

		$result = $qb->executeQuery();
		$months = [];
		while ($row = $result->fetch()) {
			$months[] = (int)$row['month'];
		}
		$result->closeCursor();

		return $months;
	}

	/**
	 * Delete index entry by file ID
	 */
	public function deleteByFileId(int $fileId, string $userId): void
	{
		$qb = $this->db->getQueryBuilder();
		$qb->delete($this->getTableName())
			->where($qb->expr()->eq('file_id', $qb->createNamedParameter($fileId, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId, IQueryBuilder::PARAM_STR)));

		$qb->executeStatement();
	}

	/**
	 * Delete all entries for a user
	 */
	public function deleteByUser(string $userId): void
	{
		$qb = $this->db->getQueryBuilder();
		$qb->delete($this->getTableName())
			->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId, IQueryBuilder::PARAM_STR)));

		$qb->executeStatement();
	}
}

