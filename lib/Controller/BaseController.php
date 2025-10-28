<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCA\ThreeDViewer\Service\ResponseBuilder;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\Exception\UnsupportedFileTypeException;
use OCA\ThreeDViewer\Service\Exception\UnauthorizedException;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\JSONResponse;
use OCP\Files\File;
use OCP\Files\NotFoundException;
use OCP\IRequest;
use Psr\Log\LoggerInterface;

/**
 * Base controller with common functionality for 3D viewer controllers
 */
abstract class BaseController extends Controller
{
    protected ResponseBuilder $responseBuilder;
    protected ModelFileSupport $modelFileSupport;
    protected LoggerInterface $logger;

    public function __construct(
        string $appName,
        IRequest $request,
        ResponseBuilder $responseBuilder,
        ModelFileSupport $modelFileSupport,
        LoggerInterface $logger
    ) {
        parent::__construct($appName, $request);
        $this->responseBuilder = $responseBuilder;
        $this->modelFileSupport = $modelFileSupport;
        $this->logger = $logger;
    }

    /**
     * Validate file ID parameter
     * @param mixed $fileId - File ID to validate
     * @return int Validated file ID
     * @throws \InvalidArgumentException If file ID is invalid
     */
    protected function validateFileId($fileId): int
    {
        if ($fileId === null || $fileId === '') {
            throw new \InvalidArgumentException('File ID is required');
        }

        $id = (int)$fileId;
        if ($id <= 0) {
            throw new \InvalidArgumentException('File ID must be a positive integer');
        }

        return $id;
    }

    /**
     * Validate file extension
     * @param string $extension - Extension to validate
     * @return string Validated extension
     * @throws UnsupportedFileTypeException If extension is not supported
     */
    protected function validateFileExtension(string $extension): string
    {
        $normalizedExt = strtolower($extension);

        if (!$this->modelFileSupport->isSupported($normalizedExt)) {
            throw new UnsupportedFileTypeException(
                'Unsupported file type: ' . $extension
            );
        }

        return $normalizedExt;
    }

    /**
     * Validate file object
     * @param File $file - File to validate
     * @return File Validated file
     * @throws UnsupportedFileTypeException If file type is not supported
     */
    protected function validateFile(File $file): File
    {
        $extension = strtolower($file->getExtension());
        $this->validateFileExtension($extension);

        return $file;
    }

    /**
     * Handle common exceptions and return appropriate responses
     * @param \Throwable $exception - Exception to handle
     * @return JSONResponse Error response
     */
    protected function handleException(\Throwable $exception): JSONResponse
    {
        $this->logger->error('Controller exception', [
            'exception' => $exception->getMessage(),
            'trace' => $exception->getTraceAsString(),
            'controller' => static::class
        ]);

        if ($exception instanceof UnauthorizedException) {
            return $this->responseBuilder->createUnauthorizedResponse($exception->getMessage());
        }

        if ($exception instanceof UnsupportedFileTypeException) {
            return $this->responseBuilder->createUnsupportedMediaTypeResponse(
                $exception->getMessage(),
                $exception->getExtension()
            );
        }

        if ($exception instanceof NotFoundException) {
            return $this->responseBuilder->createNotFoundResponse($exception->getMessage());
        }

        if ($exception instanceof \InvalidArgumentException) {
            return $this->responseBuilder->createBadRequestResponse($exception->getMessage());
        }

        // Generic error response
        return $this->responseBuilder->createErrorResponse(
            'An unexpected error occurred',
            \OCP\AppFramework\Http::STATUS_INTERNAL_SERVER_ERROR,
            [
                'type' => get_class($exception),
                'message' => $exception->getMessage()
            ]
        );
    }

    /**
     * Log file access for security auditing
     * @param File $file - File being accessed
     * @param string $action - Action being performed
     * @param array $context - Additional context
     */
    protected function logFileAccess(File $file, string $action, array $context = []): void
    {
        $this->logger->info('File access', array_merge([
            'action' => $action,
            'file_id' => $file->getId(),
            'file_name' => $file->getName(),
            'file_size' => $file->getSize(),
            'file_path' => $file->getPath(),
            'mime_type' => $file->getMimeType()
        ], $context));
    }

    /**
     * Check if file size is within limits
     * @param File $file - File to check
     * @param int $maxSize - Maximum allowed size in bytes
     * @return bool Whether file size is acceptable
     */
    protected function isFileSizeAcceptable(File $file, int $maxSize = 500 * 1024 * 1024): bool
    {
        return $file->getSize() <= $maxSize;
    }

    /**
     * Get file size category
     * @param File $file - File to categorize
     * @return string Size category
     */
    protected function getFileSizeCategory(File $file): string
    {
        $size = $file->getSize();

        if ($size <= 10 * 1024 * 1024) {
            return 'small';
        }
        if ($size <= 50 * 1024 * 1024) {
            return 'medium';
        }
        if ($size <= 100 * 1024 * 1024) {
            return 'large';
        }
        return 'very-large';
    }

    /**
     * Format file size for logging
     * @param int $size - Size in bytes
     * @return string Formatted size
     */
    protected function formatFileSize(int $size): string
    {
        $units = ['B', 'KB', 'MB', 'GB'];
        $unitIndex = 0;

        while ($size >= 1024 && $unitIndex < count($units) - 1) {
            $size /= 1024;
            $unitIndex++;
        }

        return round($size, 2) . ' ' . $units[$unitIndex];
    }

    /**
     * Validate MTL file name
     * @param string $mtlName - MTL file name to validate
     * @return string Validated MTL name
     * @throws \InvalidArgumentException If MTL name is invalid
     */
    protected function validateMtlName(string $mtlName): string
    {
        if (empty($mtlName)) {
            throw new \InvalidArgumentException('MTL file name is required');
        }

        $mtlName = trim($mtlName);

        if (strlen($mtlName) > 255) {
            throw new \InvalidArgumentException('MTL file name is too long');
        }

        if (preg_match('/[<>:"/\\\\|?*]/', $mtlName)) {
            throw new \InvalidArgumentException('MTL file name contains invalid characters');
        }

        return $mtlName;
    }

    /**
     * Get file extension from filename
     * @param string $filename - Filename
     * @return string File extension
     */
    protected function getFileExtension(string $filename): string
    {
        return strtolower(pathinfo($filename, PATHINFO_EXTENSION));
    }

    /**
     * Check if request is from a mobile device
     * @return bool Whether request is from mobile
     */
    protected function isMobileRequest(): bool
    {
        $userAgent = $this->request->getHeader('User-Agent') ?? '';
        return preg_match('/Mobile|Android|iPhone|iPad/', $userAgent) === 1;
    }

    /**
     * Get client IP address
     * @return string Client IP
     */
    protected function getClientIp(): string
    {
        $headers = [
            'HTTP_CF_CONNECTING_IP',
            'HTTP_X_FORWARDED_FOR',
            'HTTP_X_FORWARDED',
            'HTTP_X_CLUSTER_CLIENT_IP',
            'HTTP_FORWARDED_FOR',
            'HTTP_FORWARDED',
            'REMOTE_ADDR'
        ];

        foreach ($headers as $header) {
            if (!empty($_SERVER[$header])) {
                $ips = explode(',', $_SERVER[$header]);
                return trim($ips[0]);
            }
        }

        return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    }

    /**
     * Rate limiting check (basic implementation)
     * @param string $identifier - Client identifier
     * @param int $maxRequests - Maximum requests per window
     * @param int $windowSeconds - Time window in seconds
     * @return bool Whether request is allowed
     */
    protected function checkRateLimit(string $identifier, int $maxRequests = 100, int $windowSeconds = 3600): bool
    {
        // This is a basic implementation - in production, use a proper rate limiting service
        $cacheKey = 'rate_limit_' . md5($identifier);
        $currentTime = time();
        $windowStart = $currentTime - $windowSeconds;

        // Get existing requests from cache (simplified)
        $requests = json_decode($_SESSION[$cacheKey] ?? '[]', true);

        // Filter requests within the time window
        $requests = array_filter($requests, function ($timestamp) use ($windowStart) {
            return $timestamp > $windowStart;
        });

        // Check if limit exceeded
        if (count($requests) >= $maxRequests) {
            return false;
        }

        // Add current request
        $requests[] = $currentTime;
        $_SESSION[$cacheKey] = json_encode($requests);

        return true;
    }
}
