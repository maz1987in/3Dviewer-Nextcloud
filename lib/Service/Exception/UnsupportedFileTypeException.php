<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service\Exception;

use RuntimeException;

/**
 * Thrown when a requested file has an extension that is not supported by the viewer.
 */
class UnsupportedFileTypeException extends RuntimeException {
    public function __construct(string $message = '', int $code = 0, ?\Throwable $previous = null) {
        parent::__construct($message, $code, $previous);
    }
}
