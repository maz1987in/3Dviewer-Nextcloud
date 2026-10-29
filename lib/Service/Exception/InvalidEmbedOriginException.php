<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service\Exception;

/**
 * A list of sites allowed to embed that the admin route refuses to store. The message
 * and the entries are safe to show the admin.
 */
class InvalidEmbedOriginException extends \InvalidArgumentException
{
    /**
     * @param list<string> $invalid the entries that are not site addresses, as typed
     */
    public function __construct(private readonly array $invalid, string $message = 'Not a site address')
    {
        parent::__construct($message);
    }

    /** @return list<string> */
    public function getInvalid(): array
    {
        return $this->invalid;
    }
}
