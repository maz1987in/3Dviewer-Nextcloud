<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCA\ThreeDViewer\Db\FileIndexMapper;
use OCA\ThreeDViewer\Service\FileIndexService;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\ResponseBuilder;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\StreamResponse;
use OCP\Files\IRootFolder;
use OCP\Files\Tags\ISystemTagManager;
use OCP\IRequest;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;

/**
 * Controller for serving 3D files using Nextcloud filesystem API.
 */
class FileController extends BaseController
{
    public function __construct(
        string $appName,
        IRequest $request,
        private readonly IRootFolder $rootFolder,
        private readonly IUserSession $userSession,
        private readonly FileIndexMapper $fileIndexMapper,
        private readonly FileIndexService $fileIndexService,
        private readonly ?ISystemTagManager $systemTagManager,
        ModelFileSupport $modelFileSupport,
        ResponseBuilder $responseBuilder,
        LoggerInterface $logger
    ) {
        parent::__construct($appName, $request, $responseBuilder, $modelFileSupport, $logger);
    }

    /**
     * Test endpoint to verify routing is working.
     */
    #[NoAdminRequired]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/test')]
    public function test(): JSONResponse
    {
        return new JSONResponse(['status' => 'ok', 'message' => 'FileController is working']);
    }

    /**
     * Serve a 3D file by ID using Nextcloud filesystem API.
     */
    #[NoAdminRequired]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/file/{fileId}')]
    public function serveFile(int $fileId): StreamResponse|JSONResponse
    {
        try {
            // Validate file ID
            $fileId = $this->validateFileId($fileId);

            // Check authentication
            $user = $this->userSession->getUser();
            if ($user === null) {
                return $this->responseBuilder->createUnauthorizedResponse('User not authenticated');
            }

            // Get user's folder and find file
            $userFolder = $this->rootFolder->getUserFolder($user->getUID());
            $files = $userFolder->getById($fileId);

            if (empty($files)) {
                return $this->responseBuilder->createNotFoundResponse('File not found');
            }

            $file = $files[0];
            if (!$file instanceof \OCP\Files\File) {
                return $this->responseBuilder->createBadRequestResponse('Not a file');
            }

            // Validate file (skip validation for dependency files like bin, png, jpg, etc.)
            $extension = strtolower($file->getExtension());
            $dependencyExtensions = ['bin', 'png', 'jpg', 'jpeg', 'tif', 'tiff', 'tga', 'bmp', 'webp'];

            if (!in_array($extension, $dependencyExtensions)) {
                $this->validateFile($file);
            }

            // Check file size
            if (!$this->isFileSizeAcceptable($file)) {
                return $this->responseBuilder->createErrorResponse(
                    'File too large',
                    Http::STATUS_REQUEST_ENTITY_TOO_LARGE,
                    [
                        'file_size' => $this->formatFileSize($file->getSize()),
                        'max_size' => $this->formatFileSize(500 * 1024 * 1024),
                    ]
                );
            }

            // Log file access
            $this->logFileAccess($file, 'serve', [
                'size_category' => $this->getFileSizeCategory($file),
                'client_ip' => $this->getClientIp(),
                'is_mobile' => $this->isMobileRequest(),
            ]);

            // Build and return response
            $extension = strtolower($file->getExtension());

            return $this->responseBuilder->buildStreamResponse($file, $extension);
        } catch (\Throwable $e) {
            return $this->handleException($e);
        }
    }

    /**
     * Trigger indexing of all 3D files for the current user.
     */
    #[NoAdminRequired]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'POST', url: '/api/files/index')]
    public function indexFiles(): JSONResponse
    {
        try {
            $user = $this->userSession->getUser();
            if ($user === null) {
                return $this->responseBuilder->createUnauthorizedResponse('User not authenticated');
            }

            $userId = $user->getUID();
            $this->logger->info('Starting file indexing', ['user_id' => $userId]);

            $this->fileIndexService->reindexUser($userId);

            $this->logger->info('File indexing completed', ['user_id' => $userId]);

            return new JSONResponse([
                'status' => 'success',
                'message' => 'Files indexed successfully',
            ]);
        } catch (\Throwable $e) {
            return $this->handleException($e);
        }
    }

    /**
     * List 3D files in user's folder.
     * Supports sorting: folders, type, date, favorites
     */
    #[NoAdminRequired]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/files/list')]
    public function listFiles(): JSONResponse
    {
        try {
            // Check authentication
            $user = $this->userSession->getUser();
            if ($user === null) {
                return $this->responseBuilder->createUnauthorizedResponse('User not authenticated');
            }

            $userId = $user->getUID();
            $sort = $this->request->getParam('sort', 'folders'); // folders, type, date, favorites
            $filterFavorites = $this->request->getParam('filter') === 'favorites';
            $folderPath = $this->request->getParam('folder'); // Optional folder path filter
            $includeDependencies = filter_var($this->request->getParam('includeDependencies'), FILTER_VALIDATE_BOOLEAN);

            // Get favorites file IDs if needed
            $favoriteFileIds = [];
            if ($filterFavorites || $sort === 'favorites') {
                $favoriteFileIds = $this->getFavoriteFileIds($userId);
                if (empty($favoriteFileIds) && ($filterFavorites || $sort === 'favorites')) {
                    // No favorites, return empty result
                    return $this->responseBuilder->createFileListResponse([], 0);
                }
            }

            // If folder path is specified, get files and subfolders from that folder
            if ($folderPath !== null && $folderPath !== '') {
                if ($includeDependencies) {
                    $folderData = $this->listFolderWithDependencies($userId, $folderPath);
                    return new JSONResponse($folderData);
                }

                // Get files directly in this folder
                $files = $this->fileIndexMapper->getFilesByFolder($userId, $folderPath);
                
                // Filter to only include 3D model files (exclude images)
                $supportedExtensions = ['glb', 'gltf', 'obj', 'stl', 'ply', 'fbx', '3mf', '3ds', 'dae', 'x3d', 'vrml', 'wrl'];
                $imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'tif', 'heic', 'heif'];
                $filteredFiles = array_filter($files, function($file) use ($supportedExtensions, $imageExtensions) {
                    $ext = strtolower($file->getExtension() ?? '');
                    // Exclude image files
                    if (in_array($ext, $imageExtensions, true)) {
                        return false;
                    }
                    // Only include supported 3D model extensions
                    return in_array($ext, $supportedExtensions, true);
                });
                
                $formattedFiles = array_map(function ($file) use ($favoriteFileIds) {
                    return $this->formatFileIndex($file, $favoriteFileIds);
                }, $filteredFiles);
                
                // Build folder structure for subfolders recursively
                $subfolders = $this->buildFolderStructureForPath($userId, $folderPath, $favoriteFileIds);
                
                // Log for debugging
                $this->logger->info('Folder navigation response', [
                    'user_id' => $userId,
                    'folder_path' => $folderPath,
                    'files_count' => count($formattedFiles),
                    'subfolders_count' => count($subfolders),
                ]);
                
                return new JSONResponse([
                    'files' => $formattedFiles,
                    'folders' => $subfolders,
                ]);
            }

            // Query database index based on sort mode
            $files = $this->queryFilesFromIndex($userId, $sort, $favoriteFileIds);

            // Build hierarchical structure based on sort mode
            $response = $this->buildHierarchicalResponse($files, $sort, $userId, $favoriteFileIds);

            // Log file listing
            $this->logger->info('File list requested', [
                'user_id' => $userId,
                'sort' => $sort,
                'filter_favorites' => $filterFavorites,
                'total_files' => count($files),
                'client_ip' => $this->getClientIp(),
            ]);

            return new JSONResponse($response);
        } catch (\Throwable $e) {
            return $this->handleException($e);
        }
    }

    /**
     * Get favorite file IDs from Nextcloud system tags
     * @return int[]
     */
    private function getFavoriteFileIds(string $userId): array
    {
        if ($this->systemTagManager === null) {
            return [];
        }

        try {
            // Nextcloud uses system tag ID 10 for favorites
            $favoriteTag = $this->systemTagManager->getTagsByIds([10]);
            if (empty($favoriteTag)) {
                return [];
            }

            $tag = $favoriteTag[0];
            $userFolder = $this->rootFolder->getUserFolder($userId);
            
            // Get all files with favorite tag
            $favoriteFiles = $this->systemTagManager->getFilesWithTag($tag->getId());
            $fileIds = [];
            
            foreach ($favoriteFiles as $fileId) {
                // Verify file exists and is a 3D file
                $nodes = $userFolder->getById($fileId);
                if (!empty($nodes)) {
                    $node = $nodes[0];
                    if ($node instanceof \OCP\Files\File) {
                        $extension = strtolower($node->getExtension());
                        if ($this->modelFileSupport->isSupported($extension)) {
                            $fileIds[] = $fileId;
                        }
                    }
                }
            }
            
            return $fileIds;
        } catch (\Throwable $e) {
            $this->logger->error('Failed to get favorite file IDs: ' . $e->getMessage(), [
                'exception' => $e,
            ]);
            return [];
        }
    }

    /**
     * Query files from database index based on sort mode
     * @param string $userId
     * @param string $sort
     * @param int[] $favoriteFileIds
     * @return \OCA\ThreeDViewer\Db\FileIndex[]
     */
    private function queryFilesFromIndex(string $userId, string $sort, array $favoriteFileIds = []): array
    {
        $allFiles = [];

        switch ($sort) {
            case 'type':
                // Get all extensions
                $extensions = $this->fileIndexMapper->getExtensions($userId);
                foreach ($extensions as $extension) {
                    $files = $this->fileIndexMapper->getFilesByExtension($userId, strtolower($extension));
                    $allFiles = array_merge($allFiles, $files);
                }
                break;

            case 'date':
            case 'favorites':
                // Get all files for date/favorites sorting
                $allFiles = $this->fileIndexMapper->getFilesByUser($userId);
                break;

            case 'folders':
            default:
                // Get all files for folder sorting
                $allFiles = $this->fileIndexMapper->getFilesByUser($userId);
                break;
        }

        // Filter by favorites if needed
        if (!empty($favoriteFileIds)) {
            $allFiles = array_filter($allFiles, function ($file) use ($favoriteFileIds) {
                return in_array($file->getFileId(), $favoriteFileIds);
            });
        }

        return array_values($allFiles);
    }

    /**
     * List all files and subfolders for dependency loading (includes non-3D assets like textures)
     */
    private function listFolderWithDependencies(string $userId, string $folderPath): array
    {
        $files = [];
        $folders = [];

        try {
            $userFolder = $this->rootFolder->getUserFolder($userId);
            $normalizedPath = ltrim($folderPath, '/');
            $currentFolder = $normalizedPath === '' ? $userFolder : $userFolder->get($normalizedPath);

            if (!$currentFolder instanceof \OCP\Files\Folder) {
                return [
                    'files' => [],
                    'folders' => [],
                ];
            }

            foreach ($currentFolder->getDirectoryListing() as $node) {
                if ($node instanceof \OCP\Files\File) {
                    $files[] = [
                        'id' => $node->getId(),
                        'name' => $node->getName(),
                        'path' => $normalizedPath,
                        'size' => $node->getSize(),
                        'extension' => strtolower((string) $node->getExtension()),
                        'mime' => $node->getMimeType(),
                        'mtime' => $node->getMTime(),
                    ];
                } elseif ($node instanceof \OCP\Files\Folder) {
                    $childPath = $normalizedPath === ''
                        ? $node->getName()
                        : $normalizedPath . '/' . $node->getName();

                    $folders[] = [
                        'name' => $node->getName(),
                        'path' => $childPath,
                    ];
                }
            }
        } catch (\Throwable $e) {
            $this->logger->warning('Failed to list folder for dependencies', [
                'folder_path' => $folderPath,
                'exception' => $e,
            ]);
        }

        return [
            'files' => $files,
            'folders' => $folders,
        ];
    }

    /**
     * Build hierarchical response structure
     */
    private function buildHierarchicalResponse(array $files, string $sort, string $userId, array $favoriteFileIds = []): array
    {
        switch ($sort) {
            case 'folders':
                return $this->buildFolderStructure($files, $userId, $favoriteFileIds);

            case 'type':
                return $this->buildTypeStructure($files, $favoriteFileIds);

            case 'date':
                return $this->buildDateStructure($files, $favoriteFileIds);

            case 'favorites':
                // Favorites are just a flat list
                return $this->buildFileList($files, $userId, $favoriteFileIds);

            default:
                return $this->buildFileList($files, $userId, $favoriteFileIds);
        }
    }

    /**
     * Build folder tree structure
     */
    private function buildFolderStructure(array $files, string $userId, array $favoriteFileIds = []): array
    {
        // Build folder tree from files (this ensures all folders with files are included)
        $tree = [];
        
        // First, add all folders that contain files
        foreach ($files as $file) {
            $folderPath = $file->getFolderPath();
            if (empty($folderPath)) {
                // Root level files - we don't show root as a folder
                continue;
            } else {
                // Build the folder path structure
                $pathParts = explode('/', $folderPath);
                $current = &$tree;
                $currentPath = '';

                foreach ($pathParts as $part) {
                    if (empty($part)) {
                        continue;
                    }
                    $currentPath = $currentPath === '' ? $part : $currentPath . '/' . $part;
                    
                    if (!isset($current[$part])) {
                        $current[$part] = [
                            'name' => $part,
                            'path' => $currentPath,
                            'children' => [],
                            'files' => [],
                        ];
                    }
                    $current = &$current[$part]['children'];
                }
            }
        }

        // Now add files to their folders (filter out image files)
        $supportedExtensions = ['glb', 'gltf', 'obj', 'stl', 'ply', 'fbx', '3mf', '3ds', 'dae', 'x3d', 'vrml', 'wrl'];
        $imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'tif', 'heic', 'heif'];
        
        foreach ($files as $file) {
            $ext = strtolower($file->getExtension() ?? '');
            // Exclude image files
            if (in_array($ext, $imageExtensions, true)) {
                continue;
            }
            // Only include supported 3D model extensions
            if (!in_array($ext, $supportedExtensions, true)) {
                continue;
            }
            
            $folderPath = $file->getFolderPath();
            if (empty($folderPath)) {
                // Root level files - skip (we don't show root as a folder)
                continue;
            } else {
                // Add file to its folder
                $this->addFileToFolder($tree, $folderPath, $this->formatFileIndex($file, $favoriteFileIds));
            }
        }

        // Convert tree to flat list structure
        $flattened = $this->flattenFolderTree($tree);
        
        // Log before filtering with detailed structure
        $this->logger->debug('Folder structure before filtering', [
            'user_id' => $userId,
            'total_files' => count($files),
            'total_folders' => count($flattened),
        ]);
        
        // Filter out folders without 3D files
        $filtered = $this->filterFoldersWith3DFiles($flattened);
        
        // Log after filtering
        $this->logger->debug('Folder structure after filtering', [
            'user_id' => $userId,
            'total_folders_before' => count($flattened),
            'total_folders_after' => count($filtered),
            'folder_names_after' => array_map(function($f) { return $f['name'] ?? 'unknown'; }, $filtered),
        ]);
        
        return $filtered;
    }

    /**
     * Add file to folder in tree
     */
    private function addFileToFolder(array &$tree, string $folderPath, array $file): void
    {
        if (empty($folderPath)) {
            // Root files - we don't add them to tree anymore
            return;
        }

        $pathParts = explode('/', $folderPath);
        $current = &$tree;

        // Navigate to the folder
        foreach ($pathParts as $part) {
            if (empty($part)) {
                continue;
            }
            if (!isset($current[$part])) {
                // This shouldn't happen if we built the tree correctly, but handle it anyway
                $currentPath = '';
                foreach ($pathParts as $p) {
                    if ($p === $part) break;
                    $currentPath = $currentPath === '' ? $p : $currentPath . '/' . $p;
                }
                $current[$part] = [
                    'name' => $part,
                    'path' => $currentPath === '' ? $part : $currentPath . '/' . $part,
                    'children' => [],
                    'files' => [],
                ];
            }
            $current = &$current[$part]['children'];
        }

        // Go back to parent to add file
        $parent = &$tree;
        foreach ($pathParts as $part) {
            if (empty($part)) {
                continue;
            }
            if (!isset($parent[$part])) {
                // Shouldn't happen, but handle gracefully
                return;
            }
            $parent = &$parent[$part];
        }
        $parent['files'][] = $file;
    }

    /**
     * Flatten folder tree to list
     */
    private function flattenFolderTree(array $tree): array
    {
        $result = [];
        foreach ($tree as $key => $node) {
            if ($key === '__root__') {
                // Root files go first (but we don't include root as a folder in the list)
                // Root files are handled separately if needed
                continue;
            } else {
                $result[] = [
                    'type' => 'folder',
                    'name' => $node['name'],
                    'path' => $node['path'],
                    'children' => $this->flattenFolderTree($node['children']),
                    'files' => $node['files'],
                ];
            }
        }
        return $result;
    }

    /**
     * Build type structure (grouped by extension)
     */
    private function buildTypeStructure(array $files, array $favoriteFileIds = []): array
    {
        $types = [];
        $supportedExtensions = ['glb', 'gltf', 'obj', 'stl', 'ply', 'fbx', '3mf', '3ds', 'dae', 'x3d', 'vrml', 'wrl'];
        $imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'tif', 'heic', 'heif'];
        
        foreach ($files as $file) {
            $ext = strtolower($file->getExtension() ?? '');
            // Exclude image files
            if (in_array($ext, $imageExtensions, true)) {
                continue;
            }
            // Only include supported 3D model extensions
            if (!in_array($ext, $supportedExtensions, true)) {
                continue;
            }
            
            $extension = strtoupper($file->getExtension());
            if (!isset($types[$extension])) {
                $types[$extension] = [
                    'type' => 'type',
                    'name' => $extension,
                    'extension' => $file->getExtension(),
                    'files' => [],
                ];
            }
            $types[$extension]['files'][] = $this->formatFileIndex($file, $favoriteFileIds);
        }

        return array_values($types);
    }

    /**
     * Build date structure (year -> month -> files)
     */
    private function buildDateStructure(array $files, array $favoriteFileIds = []): array
    {
        $years = [];
        $supportedExtensions = ['glb', 'gltf', 'obj', 'stl', 'ply', 'fbx', '3mf', '3ds', 'dae', 'x3d', 'vrml', 'wrl'];
        $imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'tif', 'heic', 'heif'];
        
        foreach ($files as $file) {
            $ext = strtolower($file->getExtension() ?? '');
            // Exclude image files
            if (in_array($ext, $imageExtensions, true)) {
                continue;
            }
            // Only include supported 3D model extensions
            if (!in_array($ext, $supportedExtensions, true)) {
                continue;
            }
            $year = $file->getYear();
            if (!isset($years[$year])) {
                $years[$year] = [
                    'type' => 'year',
                    'name' => (string)$year,
                    'year' => $year,
                    'months' => [],
                ];
            }

            $month = $file->getMonth();
            $monthName = date('F', mktime(0, 0, 0, $month, 1, $year)); // e.g., "January"
            $monthKey = $month;

            if (!isset($years[$year]['months'][$monthKey])) {
                $years[$year]['months'][$monthKey] = [
                    'type' => 'month',
                    'name' => $monthName . ' ' . $year,
                    'year' => $year,
                    'month' => $month,
                    'files' => [],
                ];
            }

            $years[$year]['months'][$monthKey]['files'][] = $this->formatFileIndex($file, $favoriteFileIds);
        }

        // Sort years descending, months descending
        krsort($years);
        foreach ($years as &$yearData) {
            krsort($yearData['months']);
            $yearData['months'] = array_values($yearData['months']);
        }

        return array_values($years);
    }

    /**
     * Build simple file list
     */
    private function buildFileList(array $files, string $userId, array $favoriteFileIds = []): array
    {
        return [
            'type' => 'list',
            'files' => array_map(function ($file) use ($favoriteFileIds) {
                return $this->formatFileIndex($file, $favoriteFileIds);
            }, $files),
        ];
    }

    /**
     * Build folder structure for a specific folder path (recursive)
     * Returns immediate children folders with their files and nested children
     * Only includes folders that have 3D files directly or in any descendant folder
     */
    private function buildFolderStructureForPath(string $userId, string $parentPath, array $favoriteFileIds = []): array
    {
        // Normalize parent path (handle empty/root case)
        $normalizedParentPath = $parentPath === '' ? null : $parentPath;
        
        // Get immediate child folders (this now includes intermediate folders)
        $subfolderPaths = $this->fileIndexMapper->getFolders($userId, $normalizedParentPath);
        
        // Log for debugging
        $this->logger->debug('Building folder structure', [
            'user_id' => $userId,
            'parent_path' => $parentPath,
            'normalized_parent_path' => $normalizedParentPath,
            'subfolder_paths_count' => count($subfolderPaths),
            'subfolder_paths' => $subfolderPaths,
        ]);
        
        $folders = [];
        foreach ($subfolderPaths as $subfolderPath) {
            // Extract immediate child name (first part after parent path)
            if ($normalizedParentPath === null || $normalizedParentPath === '') {
                // Root level - extract first part
                $pathParts = explode('/', $subfolderPath);
                $childName = $pathParts[0];
            } else {
                // Child level - extract relative path
                $relativePath = str_replace($normalizedParentPath . '/', '', $subfolderPath);
                $childName = explode('/', $relativePath)[0];
            }
            
            // Get files in this folder (may be empty if it's an intermediate folder)
            $childFiles = $this->fileIndexMapper->getFilesByFolder($userId, $subfolderPath);
            
            // Filter to only include 3D model files (exclude images)
            $supportedExtensions = ['glb', 'gltf', 'obj', 'stl', 'ply', 'fbx', '3mf', '3ds', 'dae', 'x3d', 'vrml', 'wrl'];
            $imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'tif', 'heic', 'heif'];
            $filteredChildFiles = array_filter($childFiles, function($file) use ($supportedExtensions, $imageExtensions) {
                $ext = strtolower($file->getExtension() ?? '');
                // Exclude image files
                if (in_array($ext, $imageExtensions, true)) {
                    return false;
                }
                // Only include supported 3D model extensions
                return in_array($ext, $supportedExtensions, true);
            });
            
            $childFormattedFiles = array_map(function ($file) use ($favoriteFileIds) {
                return $this->formatFileIndex($file, $favoriteFileIds);
            }, $filteredChildFiles);
            
            // Recursively get nested children (this will find subfolder3 even if subfolder2 has no files)
            $nestedChildren = $this->buildFolderStructureForPath($userId, $subfolderPath, $favoriteFileIds);
            
            // Check if this folder has 3D files directly (filter out non-3D files)
            $supportedExtensions = ['glb', 'gltf', 'obj', 'stl', 'ply', 'fbx', '3mf', '3ds', 'dae', 'x3d', 'vrml', 'wrl'];
            $has3DFilesDirectly = false;
            foreach ($childFormattedFiles as $file) {
                $ext = strtolower($file['extension'] ?? $file['type'] ?? '');
                if (in_array($ext, $supportedExtensions, true)) {
                    $has3DFilesDirectly = true;
                    break;
                }
            }
            
            // Check if any descendant has 3D files
            $has3DFilesInDescendants = $this->has3DFilesInDescendants($nestedChildren);
            
            // Only include folder if it has 3D files directly OR in any descendant
            if ($has3DFilesDirectly || $has3DFilesInDescendants) {
                // Ensure files is always an array (not an object)
                $filesArray = is_array($childFormattedFiles) ? $childFormattedFiles : array_values((array)$childFormattedFiles);
                $folders[] = [
                    'name' => $childName,
                    'path' => $subfolderPath,
                    'children' => $nestedChildren,
                    'files' => $filesArray,
                ];
            }
        }
        
        return $folders;
    }

    /**
     * Check if any folder in the tree (recursively) has 3D files
     * 
     * @param array $folders Array of folder structures
     * @return bool True if any folder has 3D files
     */
    private function has3DFilesInDescendants(array $folders): bool
    {
        $supportedExtensions = ['glb', 'gltf', 'obj', 'stl', 'ply', 'fbx', '3mf', '3ds', 'dae', 'x3d', 'vrml', 'wrl'];
        
        foreach ($folders as $folder) {
            // Check if this folder has 3D files directly (not just any files)
            if (isset($folder['files']) && is_array($folder['files'])) {
                foreach ($folder['files'] as $file) {
                    $ext = strtolower($file['extension'] ?? $file['type'] ?? '');
                    if (in_array($ext, $supportedExtensions, true)) {
                        return true;
                    }
                }
            }
            
            // Recursively check children
            if (isset($folder['children']) && is_array($folder['children']) && count($folder['children']) > 0) {
                if ($this->has3DFilesInDescendants($folder['children'])) {
                    return true;
                }
            }
        }
        
        return false;
    }

    /**
     * Filter folders to only include those with 3D files (directly or in descendants)
     * 
     * @param array $folders Array of folder structures
     * @return array Filtered folders
     */
    private function filterFoldersWith3DFiles(array $folders): array
    {
        $filtered = [];
        $supportedExtensions = ['glb', 'gltf', 'obj', 'stl', 'ply', 'fbx', '3mf', '3ds', 'dae', 'x3d', 'vrml', 'wrl'];
        
        $this->logger->debug('filterFoldersWith3DFiles called', [
            'folders_count' => count($folders),
        ]);
        
        foreach ($folders as $folder) {
            $folderName = $folder['name'] ?? 'unknown';
            $folderPath = $folder['path'] ?? 'unknown';
            
            // Check if this folder has 3D files directly (not just any files)
            $has3DFiles = false;
            $fileExtensions = [];
            if (isset($folder['files']) && is_array($folder['files']) && count($folder['files']) > 0) {
                foreach ($folder['files'] as $file) {
                    // Handle both array and object formats, and check multiple possible extension fields
                    $ext = '';
                    if (is_array($file)) {
                        // Try extension first, then type (which might be uppercase)
                        $ext = $file['extension'] ?? $file['type'] ?? '';
                        if (is_string($ext)) {
                            $ext = strtolower(trim($ext));
                            // Remove leading dot if present
                            $ext = ltrim($ext, '.');
                        } else {
                            $ext = '';
                        }
                        // If still empty, try to extract from filename
                        if (empty($ext) && isset($file['name'])) {
                            $fileName = $file['name'];
                            $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
                        }
                    } elseif (is_object($file)) {
                        // Handle object format if needed
                        if (method_exists($file, 'getExtension')) {
                            $ext = strtolower(trim($file->getExtension() ?? ''));
                        } elseif (isset($file->extension)) {
                            $ext = strtolower(trim($file->extension ?? ''));
                        } elseif (isset($file->name)) {
                            $ext = strtolower(pathinfo($file->name, PATHINFO_EXTENSION));
                        }
                    }
                    
                    if (!empty($ext)) {
                        $fileExtensions[] = $ext;
                        
                        if (in_array($ext, $supportedExtensions, true)) {
                            $has3DFiles = true;
                        }
                    }
                }
            }
            
            // Recursively filter children FIRST (before checking if we should include this folder)
            $filteredChildren = [];
            if (isset($folder['children']) && is_array($folder['children'])) {
                $filteredChildren = $this->filterFoldersWith3DFiles($folder['children']);
            }
            
            // Only include folder if it has 3D files OR has filtered children with files
            // This ensures intermediate folders that lead to 3D files are included
            $shouldInclude = $has3DFiles || count($filteredChildren) > 0;
            
            if ($shouldInclude) {
                // Ensure files is always an array (not an object)
                if (isset($folder['files'])) {
                    $folder['files'] = is_array($folder['files']) ? $folder['files'] : array_values((array)$folder['files']);
                } else {
                    $folder['files'] = [];
                }
                $folder['children'] = $filteredChildren;
                $filtered[] = $folder;
                
                // Log folders that are being included
                $this->logger->debug('Including folder in By Folders view', [
                    'folder_name' => $folderName,
                    'folder_path' => $folderPath,
                    'has_3d_files' => $has3DFiles,
                    'files_count' => count($folder['files']),
                    'children_count_before' => isset($folder['children']) ? count($folder['children']) : 0,
                    'filtered_children_count' => count($filteredChildren),
                ]);
            } else {
                // Log folders that are being filtered out for debugging
                $this->logger->debug('Filtering out folder (no 3D files and no valid children)', [
                    'folder_name' => $folderName,
                    'folder_path' => $folderPath,
                    'files_count' => isset($folder['files']) ? count($folder['files']) : 0,
                    'children_count_before' => isset($folder['children']) ? count($folder['children']) : 0,
                    'filtered_children_count' => count($filteredChildren),
                ]);
            }
        }
        
        return $filtered;
    }

    /**
     * Format file index to response format
     */
    private function formatFileIndex(\OCA\ThreeDViewer\Db\FileIndex $file, array $favoriteFileIds = []): array
    {
        $isFavorite = in_array($file->getFileId(), $favoriteFileIds);

        return [
            'id' => $file->getFileId(),
            'name' => $file->getName(),
            'path' => $file->getPath(),
            'folder_path' => $file->getFolderPath(),
            'extension' => $file->getExtension(),
            'type' => strtoupper($file->getExtension()),
            'size' => $file->getSize(),
            'mtime' => $file->getMtime(),
            'year' => $file->getYear(),
            'month' => $file->getMonth(),
            'formatted_size' => $this->formatFileSize($file->getSize()),
            'formatted_date' => date('Y-m-d H:i:s', $file->getMtime()),
            'isFavorite' => $isFavorite,
        ];
    }

    /**
     * Recursively find 3D files in a folder.
     */
    private function find3DFiles(\OCP\Files\Folder $folder, array &$files): void
    {
        $children = $folder->getDirectoryListing();

        foreach ($children as $node) {
            if ($node instanceof \OCP\Files\File) {
                $extension = strtolower($node->getExtension());
                if ($this->modelFileSupport->isSupported($extension)) {
                    $files[] = [
                        'id' => $node->getId(),
                        'name' => $node->getName(),
                        'path' => $node->getPath(),
                        'size' => $node->getSize(),
                        'mtime' => $node->getMTime(),
                        'extension' => $extension,
                        'size_category' => $this->getFileSizeCategory($node),
                        'formatted_size' => $this->formatFileSize($node->getSize()),
                    ];
                }
            } elseif ($node instanceof \OCP\Files\Folder) {
                $this->find3DFiles($node, $files);
            }
        }
    }

    /**
     * Find a file by path (including dependency files like MTL, textures, etc.)
     * This is used to find files that aren't indexed as 3D models
     */
    #[NoAdminRequired]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/files/find')]
    public function findFileByPath(): JSONResponse
    {
        try {
            $user = $this->userSession->getUser();
            if ($user === null) {
                return $this->responseBuilder->createUnauthorizedResponse('User not authenticated');
            }

            $filePath = $this->request->getParam('path');
            if (!$filePath || $filePath === '') {
                return $this->responseBuilder->createBadRequestResponse('Path parameter is required');
            }

            $userFolder = $this->rootFolder->getUserFolder($user->getUID());
            
            // Normalize path (remove leading slash if present)
            $normalizedPath = ltrim($filePath, '/');
            
            try {
                $node = $userFolder->get($normalizedPath);
                
                if ($node instanceof \OCP\Files\File) {
                    return new JSONResponse([
                        'id' => $node->getId(),
                        'name' => $node->getName(),
                        'path' => $filePath,
                        'size' => $node->getSize(),
                        'mtime' => $node->getMTime(),
                    ]);
                } else {
                    return $this->responseBuilder->createNotFoundResponse('File not found');
                }
            } catch (\OCP\Files\NotFoundException $e) {
                return $this->responseBuilder->createNotFoundResponse('File not found: ' . $filePath);
            }
        } catch (\Throwable $e) {
            return $this->handleException($e);
        }
    }

    /**
     * List files in a specific directory.
     */
    private function listFilesInDirectory($userFolder, string $path): JSONResponse
    {
        try {
            // Normalize path (remove leading slash if present)
            $normalizedPath = ltrim($path, '/');

            // Get the directory
            $directory = $userFolder->get($normalizedPath);

            if (!$directory instanceof \OCP\Files\Folder) {
                return new JSONResponse(['error' => 'Path is not a directory'], Http::STATUS_BAD_REQUEST);
            }

            $files = [];
            foreach ($directory->getDirectoryListing() as $node) {
                $files[] = [
                    'id' => $node->getId(),
                    'name' => $node->getName(),
                    'path' => $node->getPath(),
                    'size' => $node->getSize(),
                    'mtime' => $node->getMTime(),
                    'isFile' => $node instanceof \OCP\Files\File,
                    'isFolder' => $node instanceof \OCP\Files\Folder,
                ];
            }

            return new JSONResponse($files);
        } catch (\OCP\Files\NotFoundException $e) {
            return new JSONResponse(['error' => 'Directory not found: ' . $path], Http::STATUS_NOT_FOUND);
        } catch (\Exception $e) {
            $this->logger->error('Error listing directory: ' . $e->getMessage(), [
                'path' => $path,
                'exception' => $e,
            ]);

            return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_INTERNAL_SERVER_ERROR);
        }
    }
}
