<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

/**
 * Who changed a note: a Nextcloud user, or someone on a public link.
 *
 * A visitor on a link has no account, so what is known of them is at most a name they
 * typed. That name is untrusted text: it is cleaned once here, and every place that shows
 * it marks it as a guest's, so it can never pass for a user's own name.
 */
final class NoteActor
{
    public const USER = 'user';
    public const GUEST = 'guest';
    public const ANONYMOUS = 'anonymous';

    /** Long enough for a name, short enough that a notification line stays one line. */
    public const MAX_GUEST_NAME_CHARS = 64;

    /**
     * @param string $value the user id of a user, the cleaned name of a named guest,
     *     empty for an anonymous visitor
     */
    private function __construct(
        public readonly string $kind,
        public readonly string $value,
    ) {
    }

    public static function user(string $uid): self
    {
        return new self(self::USER, $uid);
    }

    /**
     * @param ?string $name what the visitor typed; null or blank leaves them anonymous
     */
    public static function guest(?string $name): self
    {
        $clean = self::cleanName($name ?? '');

        return $clean === '' ? new self(self::ANONYMOUS, '') : new self(self::GUEST, $clean);
    }

    /**
     * Rebuild an actor from what toParameters() stored. Anything that doesn't read as a
     * user or a named guest comes back as an anonymous visitor, so a malformed row still
     * renders.
     */
    public static function fromParameters(mixed $kind, mixed $value): self
    {
        if ($kind === self::USER && is_string($value) && $value !== '') {
            return self::user($value);
        }
        if ($kind === self::GUEST && is_string($value)) {
            return self::guest($value);
        }

        return self::guest(null);
    }

    public function isUser(): bool
    {
        return $this->kind === self::USER;
    }

    /**
     * The value a note's `author_uid` column holds for this actor. A guest's is derived
     * from the name, in a namespace user ids don't use (`guest:`), so one visitor's notes
     * can be told from another's and from a user's.
     */
    public function authorKey(): string
    {
        return match ($this->kind) {
            self::USER => $this->value,
            self::GUEST => 'guest:' . substr(sha1($this->value), 0, 16),
            default => 'guest:anonymous',
        };
    }

    /** What an Activity event records as its author: only users have one. */
    public function activityAuthor(): string
    {
        return $this->isUser() ? $this->value : '';
    }

    /**
     * @return array{actorKind: string, actor: string}
     */
    public function toParameters(): array
    {
        return ['actorKind' => $this->kind, 'actor' => $this->value];
    }

    /**
     * Control and format characters go — the latter include the bidirectional overrides
     * that make one name read as another — and runs of whitespace become one space.
     */
    private static function cleanName(string $name): string
    {
        $name = preg_replace('/\p{C}+/u', ' ', $name) ?? '';
        $name = trim(preg_replace('/\s+/u', ' ', $name) ?? '');

        return trim(mb_substr($name, 0, self::MAX_GUEST_NAME_CHARS));
    }
}
