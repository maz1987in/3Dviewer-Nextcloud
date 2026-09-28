<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service\Exception;

/**
 * The model already holds the maximum number of notes.
 */
class NoteLimitException extends InvalidNoteException
{
}
