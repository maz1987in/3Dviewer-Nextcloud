<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service\Exception;

/**
 * A note the API refuses to store. The message is safe to show the client.
 */
class InvalidNoteException extends \InvalidArgumentException
{
}
