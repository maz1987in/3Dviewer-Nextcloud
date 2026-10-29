<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCA\ThreeDViewer\AppInfo\Application;
use OCA\ThreeDViewer\Service\Exception\InvalidEmbedOriginException;
use OCP\IAppConfig;

/**
 * The sites the admin allows to show public links in a frame. Embedding is off while
 * the list is empty, which is the default.
 *
 * Each entry ends up inside the embed page's `frame-ancestors` directive, so only a
 * clean origin is ever stored or returned: `https://host[:port]`, or plain http to
 * this machine for testing. Anything that could end the directive or widen it (a
 * space, `;`, a quote, `*`) is refused, not escaped.
 */
class EmbedOrigins
{
    public const CONFIG_KEY = 'embed_origins';

    private const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
    private const DEFAULT_PORTS = ['https' => 443, 'http' => 80];

    public function __construct(
        private readonly IAppConfig $config,
    ) {
    }

    /** @return list<string> */
    public function list(): array
    {
        $origins = [];
        foreach ($this->config->getValueArray(Application::APP_ID, self::CONFIG_KEY) as $stored) {
            // Checked again on the way out: a value written some other way never reaches the header
            if (is_string($stored) && self::normalize($stored) === $stored) {
                $origins[] = $stored;
            }
        }

        return $origins;
    }

    public function isEnabled(): bool
    {
        return $this->list() !== [];
    }

    /**
     * The origin in its one stored form, or null when the input is not one.
     */
    public static function normalize(string $input): ?string
    {
        $input = trim($input);
        if (str_ends_with($input, '/')) {
            $input = substr($input, 0, -1);
        }
        if (preg_match('~^[A-Za-z][A-Za-z0-9+.-]*://[^\s/?#\'";,*@\\\\]+$~', $input) !== 1) {
            return null;
        }

        $parts = parse_url($input);
        if (!is_array($parts) || !isset($parts['scheme'], $parts['host'])) {
            return null;
        }
        $scheme = strtolower($parts['scheme']);
        $host = strtolower($parts['host']);
        $isHostName = preg_match('/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/', $host) === 1;
        $isIpv6 = preg_match('/^\[[0-9a-f:.]+\]$/', $host) === 1;
        if (!$isHostName && !$isIpv6) {
            return null;
        }
        if ($scheme !== 'https' && !($scheme === 'http' && in_array($host, self::LOCAL_HOSTS, true))) {
            return null;
        }

        $port = $parts['port'] ?? null;
        if ($port === self::DEFAULT_PORTS[$scheme]) {
            $port = null;
        }

        return $scheme . '://' . $host . ($port === null ? '' : ':' . $port);
    }

    /**
     * Store the list as given: each entry normalised, blank lines and repeats dropped,
     * the order kept. A list with any bad entry is refused whole, so a typo never
     * silently drops a site. An empty list turns embedding off.
     *
     * @param mixed $origins decoded JSON, validated here
     * @return list<string> what was stored
     * @throws InvalidEmbedOriginException
     */
    public function save(mixed $origins): array
    {
        if (!is_array($origins) || !array_is_list($origins)) {
            throw new InvalidEmbedOriginException([], 'Not a list of site addresses');
        }

        $clean = [];
        $invalid = [];
        foreach ($origins as $entry) {
            if (!is_string($entry)) {
                throw new InvalidEmbedOriginException([], 'Not a list of site addresses');
            }
            if (trim($entry) === '') {
                continue;
            }
            $origin = self::normalize($entry);
            if ($origin === null) {
                $invalid[] = $entry;
            } elseif (!in_array($origin, $clean, true)) {
                $clean[] = $origin;
            }
        }
        if ($invalid !== []) {
            throw new InvalidEmbedOriginException($invalid);
        }

        $this->config->setValueArray(Application::APP_ID, self::CONFIG_KEY, $clean);

        return $clean;
    }
}
