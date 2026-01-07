<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service\Exception;

use RuntimeException;

/**
 * Thrown when a requested file has an extension that is not supported by the viewer.
 */
class UnsupportedFileTypeException extends RuntimeException
{
    private string $extension = '';

    public function __construct(string $message = '', int $code = 0, ?\Throwable $previous = null, string $extension = '')
    {
        parent::__construct($message, $code, $previous);
        $this->extension = $extension;
    }

    public function getExtension(): string
    {
        return $this->extension;
    }
}
