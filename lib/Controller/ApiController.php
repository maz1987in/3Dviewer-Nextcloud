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

/**
 * @psalm-suppress UnusedClass
 */
class ApiController extends OCSController
{
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
     * An example API endpoint.
     *
     * @return DataResponse<Http::STATUS_OK, array{message: string}, array{}>
     *
     * 200: Data returned
     */
    #[NoAdminRequired]
    #[ApiRoute(verb: 'GET', url: '/api')]
    public function index(): DataResponse
    {
        return new DataResponse(
            ['message' => 'Hello world!']
        );
    }

    /**
     * List 3D files.
     *
     * @return DataResponse<Http::STATUS_OK, array{
     *   files: list<array{
     *     id: int,
     *     name: string,
     *     path: string,
     *     size: int,
     *     mtime: int,
     *     mimetype: string
     *   }>
     * }, array{}>
     *
     * 200: Files returned
     */
    #[NoAdminRequired]
    #[ApiRoute(verb: 'GET', url: '/api/files')]
    public function listFiles(): DataResponse
    {
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
     * Recursively scan for 3D files.
     */
    private function scanFor3DFiles($folder, array $extensions, array &$files): void
    {
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
                        'mimetype' => $node->getMimeType(),
                    ];
                }
            } elseif ($node->getType() === \OCP\Files\FileInfo::TYPE_FOLDER) {
                $this->scanFor3DFiles($node, $extensions, $files);
            }
        }
    }
}
