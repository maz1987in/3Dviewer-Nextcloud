<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service\Exception;

use RuntimeException;

/**
 * Thrown when the current request has no authenticated user context.
 */
class UnauthorizedException extends RuntimeException
{
}
