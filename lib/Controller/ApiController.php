<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\ApiRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\StreamResponse;
use OCP\AppFramework\OCSController;
use OCP\Files\IRootFolder;
use OCP\IRequest;
use OCP\IUserSession;
use OCP\AppFramework\Db\DoesNotExistException;

/**
 * @psalm-suppress UnusedClass
 */
class ApiController extends OCSController {
	private IRootFolder $rootFolder;
	private IUserSession $userSession;

	public function __construct(
		IRequest $request,
		IRootFolder $rootFolder,
		IUserSession $userSession
	) {
		parent::__construct('threedviewer', $request);
		$this->rootFolder = $rootFolder;
		$this->userSession = $userSession;
	}

	/**
	 * An example API endpoint
	 *
	 * @return DataResponse<Http::STATUS_OK, array{message: string}, array{}>
	 *
	 * 200: Data returned
	 */
	#[NoAdminRequired]
	#[ApiRoute(verb: 'GET', url: '/api')]
	public function index(): DataResponse {
		return new DataResponse(
			['message' => 'Hello world!']
		);
	}

	/**
	 * Get a file by ID
	 *
	 * @return StreamResponse|DataResponse
	 *
	 * 200: File returned
	 * 404: File not found
	 */
	#[NoAdminRequired]
	#[ApiRoute(verb: 'GET', url: '/api/file/{fileId}')]
	public function getFile(int $fileId): StreamResponse|DataResponse {
		$user = $this->userSession->getUser();
		if (!$user) {
			return new DataResponse(['error' => 'User not authenticated'], Http::STATUS_UNAUTHORIZED);
		}

		$userFolder = $this->rootFolder->getUserFolder($user->getUID());
		
		// Try to find the file by ID
		$files = $userFolder->getById($fileId);
		
		if (empty($files)) {
			return new DataResponse(['error' => 'File not found'], Http::STATUS_NOT_FOUND);
		}

		$file = $files[0];
		
		if (!$file->isReadable()) {
			return new DataResponse(['error' => 'File not readable'], Http::STATUS_FORBIDDEN);
		}

		$stream = $file->fopen('r');
		if ($stream === false) {
			return new DataResponse(['error' => 'Failed to open file'], Http::STATUS_INTERNAL_SERVER_ERROR);
		}

		$response = new StreamResponse($stream);
		$response->addHeader('Content-Type', $file->getMimeType());
		$response->addHeader('Content-Length', (string)$file->getSize());
		$response->addHeader('Content-Disposition', 'inline; filename="' . addslashes($file->getName()) . '"');
		$response->addHeader('Cache-Control', 'public, max-age=3600');
		
		return $response;
	}

	/**
	 * Get file by path (for multi-file models like OBJ+MTL+textures)
	 *
	 * @param string $path File path relative to user root (e.g., "/models/texture.jpg")
	 * @return StreamResponse|DataResponse
	 *
	 * 200: File content returned
	 * 404: File not found
	 */
	#[NoAdminRequired]
	#[ApiRoute(verb: 'GET', url: '/api/file/by-path')]
	public function getFileByPath(string $path): StreamResponse|DataResponse {
		$user = $this->userSession->getUser();
		if (!$user) {
			return new DataResponse(['error' => 'User not authenticated'], Http::STATUS_UNAUTHORIZED);
		}

		$userFolder = $this->rootFolder->getUserFolder($user->getUID());
		
		try {
			// Normalize path (remove leading slash if present)
			$normalizedPath = ltrim($path, '/');
			
			// Get the file
			$file = $userFolder->get($normalizedPath);
			
			if (!$file->isReadable()) {
				return new DataResponse(['error' => 'File not readable'], Http::STATUS_FORBIDDEN);
			}

			$stream = $file->fopen('r');
			if ($stream === false) {
				return new DataResponse(['error' => 'Failed to open file'], Http::STATUS_INTERNAL_SERVER_ERROR);
			}

			$response = new StreamResponse($stream);
			$response->addHeader('Content-Type', $file->getMimeType());
			$response->addHeader('Content-Length', (string)$file->getSize());
			$response->addHeader('Content-Disposition', 'inline; filename="' . addslashes($file->getName()) . '"');
			$response->addHeader('Cache-Control', 'public, max-age=3600');
			
			return $response;
		} catch (\OCP\Files\NotFoundException $e) {
			return new DataResponse(['error' => 'File not found: ' . $path], Http::STATUS_NOT_FOUND);
		} catch (\Exception $e) {
			return new DataResponse(['error' => $e->getMessage()], Http::STATUS_INTERNAL_SERVER_ERROR);
		}
	}

	/**
	 * List 3D files
	 *
	 * @return DataResponse<Http::STATUS_OK, array{files: array}, array{}>
	 *
	 * 200: Files returned
	 */
	#[NoAdminRequired]
	#[ApiRoute(verb: 'GET', url: '/api/files')]
	public function listFiles(): DataResponse {
		$user = $this->userSession->getUser();
		if (!$user) {
			throw new \Exception('User not authenticated');
		}

		$userFolder = $this->rootFolder->getUserFolder($user->getUID());
		
		// Supported 3D file extensions
		$supportedExtensions = ['glb', 'gltf', 'obj', 'stl', 'ply', 'fbx', '3mf', '3ds', 'dae', 'x3d', 'vrml', 'wrl'];
		
		$files = [];
		$this->scanFor3DFiles($userFolder, $supportedExtensions, $files);
		
		return new DataResponse(['files' => $files]);
	}

	/**
	 * Recursively scan for 3D files
	 */
	private function scanFor3DFiles($folder, array $extensions, array &$files): void {
		$nodes = $folder->getDirectoryListing();
		
		foreach ($nodes as $node) {
			if ($node->getType() === \OCP\Files\FileInfo::TYPE_FILE) {
				$extension = strtolower(pathinfo($node->getName(), PATHINFO_EXTENSION));
				if (in_array($extension, $extensions)) {
					$files[] = [
						'id' => $node->getId(),
						'name' => $node->getName(),
						'path' => $node->getPath(),
						'size' => $node->getSize(),
						'mtime' => $node->getMTime(),
						'mimetype' => $node->getMimeType()
					];
				}
			} elseif ($node->getType() === \OCP\Files\FileInfo::TYPE_FOLDER) {
				$this->scanFor3DFiles($node, $extensions, $files);
			}
		}
	}
}
