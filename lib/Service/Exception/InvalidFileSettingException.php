<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service\Exception;

/**
 * A file setting the API refuses to store. The message is safe to show the client.
 */
class InvalidFileSettingException extends \InvalidArgumentException
{
}
