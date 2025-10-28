<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCP\AppFramework\Http;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\StreamResponse;
use OCP\Files\File;

/**
 * Service for building standardized HTTP responses.
 */
class ResponseBuilder
{
    private ModelFileSupport $modelFileSupport;

    public function __construct(ModelFileSupport $modelFileSupport)
    {
        $this->modelFileSupport = $modelFileSupport;
    }

    /**
     * Build a stream response for a 3D file.
     * @param File $file - File to stream
     * @param string $extension - File extension
     * @param array $options - Additional options
     * @return StreamResponse
     */
    public function buildStreamResponse(File $file, string $extension, array $options = []): StreamResponse
    {
        // Open file stream
        $stream = $file->fopen('r');
        if ($stream === false) {
            throw new \RuntimeException('Failed to open file stream');
        }

        // Create response
        $response = new StreamResponse($stream);

        // Add standard headers
        $this->addStandardHeaders($response, $file, $extension);

        // Add custom headers if provided
        if (isset($options['headers']) && is_array($options['headers'])) {
            foreach ($options['headers'] as $name => $value) {
                $response->addHeader($name, $value);
            }
        }

        return $response;
    }

    /**
     * Add standard headers to a stream response.
     * @param StreamResponse $response - Response to modify
     * @param File $file - File being served
     * @param string $extension - File extension
     */
    public function addStandardHeaders(StreamResponse $response, File $file, string $extension): void
    {
        $response->addHeader('Content-Type', $this->modelFileSupport->mapContentType($extension));
        $response->addHeader('Content-Length', (string) $file->getSize());
        $response->addHeader('Content-Disposition', 'inline; filename="' . addslashes($file->getName()) . '"');
        $response->addHeader('Cache-Control', 'no-store');
        $response->addHeader('X-Content-Type-Options', 'nosniff');
        $response->addHeader('X-Frame-Options', 'SAMEORIGIN');

        // Add CSP headers for 3D viewer compatibility
        $this->addCspHeaders($response);
    }

    /**
     * Create an error response.
     * @param string $message - Error message
     * @param int $code - HTTP status code
     * @param array $details - Additional error details
     * @return JSONResponse
     */
    public function createErrorResponse(string $message, int $code = Http::STATUS_INTERNAL_SERVER_ERROR, array $details = []): JSONResponse
    {
        $data = [
            'error' => $message,
            'code' => $code,
            'timestamp' => date('c'),
        ];

        if (!empty($details)) {
            $data['details'] = $details;
        }

        return new JSONResponse($data, $code);
    }

    /**
     * Create a not found response.
     * @param string $message - Error message
     * @return JSONResponse
     */
    public function createNotFoundResponse(string $message = 'File not found'): JSONResponse
    {
        return $this->createErrorResponse($message, Http::STATUS_NOT_FOUND);
    }

    /**
     * Create an unauthorized response.
     * @param string $message - Error message
     * @return JSONResponse
     */
    public function createUnauthorizedResponse(string $message = 'Unauthorized'): JSONResponse
    {
        return $this->createErrorResponse($message, Http::STATUS_UNAUTHORIZED);
    }

    /**
     * Create an unsupported media type response.
     * @param string $message - Error message
     * @param string $extension - Unsupported extension
     * @return JSONResponse
     */
    public function createUnsupportedMediaTypeResponse(string $message = 'Unsupported file type', string $extension = ''): JSONResponse
    {
        $details = [];
        if ($extension) {
            $details['extension'] = $extension;
            $details['supported'] = $this->modelFileSupport->getSupportedExtensions();
        }

        return $this->createErrorResponse($message, Http::STATUS_UNSUPPORTED_MEDIA_TYPE, $details);
    }

    /**
     * Create a bad request response.
     * @param string $message - Error message
     * @param array $details - Additional details
     * @return JSONResponse
     */
    public function createBadRequestResponse(string $message = 'Bad request', array $details = []): JSONResponse
    {
        return $this->createErrorResponse($message, Http::STATUS_BAD_REQUEST, $details);
    }

    /**
     * Create a success response with data.
     * @param mixed $data - Response data
     * @param int $code - HTTP status code
     * @return JSONResponse
     */
    public function createSuccessResponse($data, int $code = Http::STATUS_OK): JSONResponse
    {
        return new JSONResponse($data, $code);
    }

    /**
     * Create a file list response.
     * @param array $files - List of files
     * @param int $total - Total count
     * @param int $offset - Offset
     * @param int $limit - Limit
     * @return JSONResponse
     */
    public function createFileListResponse(array $files, int $total = 0, int $offset = 0, int $limit = 0): JSONResponse
    {
        $data = [
            'files' => $files,
            'total' => $total,
            'offset' => $offset,
            'limit' => $limit,
            'hasMore' => $total > ($offset + $limit),
        ];

        return $this->createSuccessResponse($data);
    }

    /**
     * Create a validation error response.
     * @param array $errors - Validation errors
     * @return JSONResponse
     */
    public function createValidationErrorResponse(array $errors): JSONResponse
    {
        return $this->createErrorResponse('Validation failed', Http::STATUS_BAD_REQUEST, [
            'validation_errors' => $errors,
        ]);
    }

    /**
     * Create a rate limit response.
     * @param int $retryAfter - Seconds to wait before retry
     * @return JSONResponse
     */
    public function createRateLimitResponse(int $retryAfter = 60): JSONResponse
    {
        $response = $this->createErrorResponse('Rate limit exceeded', Http::STATUS_TOO_MANY_REQUESTS);
        $response->addHeader('Retry-After', (string) $retryAfter);

        return $response;
    }

    /**
     * Create a maintenance mode response.
     * @param string $message - Maintenance message
     * @return JSONResponse
     */
    public function createMaintenanceResponse(string $message = 'Service temporarily unavailable'): JSONResponse
    {
        $response = $this->createErrorResponse($message, Http::STATUS_SERVICE_UNAVAILABLE);
        $response->addHeader('Retry-After', '300'); // 5 minutes

        return $response;
    }

    /**
     * Add CORS headers to response.
     * @param JSONResponse|StreamResponse $response - Response to modify
     * @param array $allowedOrigins - Allowed origins
     */
    public function addCorsHeaders($response, array $allowedOrigins = []): void
    {
        if (empty($allowedOrigins)) {
            $allowedOrigins = ['*'];
        }

        $response->addHeader('Access-Control-Allow-Origin', implode(', ', $allowedOrigins));
        $response->addHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        $response->addHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
        $response->addHeader('Access-Control-Max-Age', '3600');
    }

    /**
     * Add security headers to response.
     * @param JSONResponse|StreamResponse $response - Response to modify
     */
    public function addSecurityHeaders($response): void
    {
        $response->addHeader('X-Content-Type-Options', 'nosniff');
        $response->addHeader('X-Frame-Options', 'SAMEORIGIN');
        $response->addHeader('X-XSS-Protection', '1; mode=block');
        $response->addHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    }

    /**
     * Add Content Security Policy headers for 3D viewer.
     * @param JSONResponse|StreamResponse $response - Response to modify
     */
    public function addCspHeaders($response): void
    {
        $csp = new ContentSecurityPolicy();

        // Allow blob URLs for GLTF texture loading and WebGL contexts
        $csp->addAllowedConnectDomain('blob:');
        $csp->addAllowedImageDomain('blob:');
        $csp->addAllowedImageDomain('data:');

        // Allow workers with blob URLs
        $csp->addAllowedChildSrcDomain('blob:');

        $response->setContentSecurityPolicy($csp);
    }

    /**
     * Add cache headers to response.
     * @param JSONResponse|StreamResponse $response - Response to modify
     * @param int $maxAge - Max age in seconds
     * @param bool $public - Whether response is public
     */
    public function addCacheHeaders($response, int $maxAge = 3600, bool $public = false): void
    {
        $cacheControl = $public ? 'public' : 'private';
        $cacheControl .= ', max-age=' . $maxAge;

        $response->addHeader('Cache-Control', $cacheControl);
        $response->addHeader('Expires', gmdate('D, d M Y H:i:s', time() + $maxAge) . ' GMT');
    }

    /**
     * Add no-cache headers to response.
     * @param JSONResponse|StreamResponse $response - Response to modify
     */
    public function addNoCacheHeaders($response): void
    {
        $response->addHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        $response->addHeader('Pragma', 'no-cache');
        $response->addHeader('Expires', '0');
    }
}
