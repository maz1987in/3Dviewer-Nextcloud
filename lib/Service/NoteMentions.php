<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCP\IUserManager;
use OCP\IUserSession;

/**
 * The people a note's text or a reply names with an @.
 *
 * The stored form is the one Nextcloud's own rich text editor writes: `@alice`, or
 * `@"alice smith"` for an id with a space in it. The stored text keeps the user id, so a
 * mention keeps meaning the same account when the person is renamed; what people read is
 * the display name, put in at read time (see NotesService::serialize) and never stored.
 *
 * A token is a mention only if it names someone the reader may be shown on this file: an
 * account that can open the file AND that the reader could find through Nextcloud's own
 * people search (NotePeople), which applies the administrator's enumeration and group
 * rules. Anything else is plain text, and plain text of exactly the same kind whether the
 * account does not exist or exists and may not be shown, so a note's author cannot use a
 * mention to learn who has accounts, who can open a file, or what anyone is called. An
 * email address is not a mention either (the @ must not follow a letter, digit or
 * underscore).
 *
 * @psalm-suppress MissingDependency Nextcloud runtime provides dependent classes in full environment.
 */
class NoteMentions
{
    /** What a public link shows where a mention was: a name there would say more than it should. */
    public const PUBLIC_PLACEHOLDER = '@someone';

    /**
     * Most people one text can notify. A reply that tags the whole directory is spam, not
     * review; the rest are still shown as mentions, they just hear nothing.
     */
    public const MAX_NOTIFIED = 10;

    /** Most tokens looked up per text, so a long run of @ signs costs a bounded number of lookups */
    private const MAX_TOKENS = 50;

    /** The simple form ends at whitespace; the quoted one may hold a space */
    private const PATTERN = '/(?<![A-Za-z0-9_])@(?:"([^"\r\n]{1,64})"|([A-Za-z0-9_\-@.\']{1,64}))/u';

    /** @var array<string, ?array{uid: string, displayName: string}> people already resolved in this request, by file and id */
    private array $accounts = [];

    /** @psalm-suppress PossiblyUnusedMethod Constructed by the DI container */
    public function __construct(
        private readonly IUserManager $users,
        private readonly NoteAccess $access,
        private readonly NotePeople $people,
        private readonly IUserSession $session,
    ) {
    }

    /**
     * Every mention in a text, in order, each token with the account it names.
     *
     * @param int $fileId the model the text is on: only people who can open it are resolved
     * @return list<array{start: int, length: int, token: string, uid: string, displayName: string, settled: bool}>
     *     `token` is the id as written, `uid` the account's own id; `settled` is false for a
     *     simple token that runs to the very end of the text, which may still be being typed
     */
    public function find(string $text, int $fileId): array
    {
        if (!str_contains($text, '@') || preg_match_all(self::PATTERN, $text, $matches, PREG_SET_ORDER | PREG_OFFSET_CAPTURE) < 1) {
            return [];
        }

        $found = [];
        $length = strlen($text);
        foreach (array_slice($matches, 0, self::MAX_TOKENS) as $match) {
            [$whole, $offset] = $match[0];
            $quoted = ($match[1][1] ?? -1) >= 0;
            $written = $quoted ? $match[1][0] : ($match[2][0] ?? '');
            $account = $this->account($fileId, $written);
            $end = $offset + strlen($whole);

            // A simple token swallows the punctuation that follows it ("@alice." at the end
            // of a sentence), so give those characters back until it names someone
            while ($account === null && !$quoted && $written !== '' && preg_match('/[.\'\-@]$/', $written) === 1) {
                $written = substr($written, 0, -1);
                $end--;
                $account = $this->account($fileId, $written);
            }
            if ($account === null) {
                continue;
            }

            $found[] = [
                'start' => $offset,
                'length' => $end - $offset,
                'token' => $written,
                'uid' => $account['uid'],
                'displayName' => $account['displayName'],
                // A quoted token is closed by its own quote; a simple one by what follows it
                'settled' => $quoted || $end < $length,
            ];
        }

        return $found;
    }

    /**
     * The accounts a text mentions, once each.
     *
     * @param bool $settledOnly leave out a token that ends the text. A note's text is saved
     *     while it is typed, a moment after each pause, so "@al" at the end may be the start
     *     of "@alice"; a reply is sent whole, and its last word is final.
     * @return list<string> user ids
     */
    public function uids(string $text, int $fileId, bool $settledOnly = false): array
    {
        $uids = [];
        foreach ($this->find($text, $fileId) as $mention) {
            if ($settledOnly && !$mention['settled']) {
                continue;
            }
            $uids[] = $mention['uid'];
        }

        return array_values(array_unique($uids));
    }

    /**
     * What the viewer needs to show a text's mentions as names: the id as written in the
     * text, and the name that stands for it.
     *
     * @return array<string, string> written id => display name
     */
    public function names(string $text, int $fileId): array
    {
        $names = [];
        foreach ($this->find($text, $fileId) as $mention) {
            $names[$mention['token']] = $mention['displayName'];
        }

        return $names;
    }

    /**
     * The text for someone who must not learn who was mentioned: every @ that reads as a
     * mention becomes PUBLIC_PLACEHOLDER, whether or not it names anyone. No lookup is made, so
     * a public link can no more tell who has an account or access than who is named; what else
     * was written is kept, and so is the punctuation that follows a mention.
     */
    public function redact(string $text): string
    {
        if (!str_contains($text, '@')) {
            return $text;
        }

        return preg_replace_callback(self::PATTERN, static function (array $match): string {
            $rest = '';
            // A bare id swallows the punctuation after it; give that back as it was written
            if (!isset($match[1]) || $match[1] === '') {
                if (isset($match[2]) && preg_match("/[.'\\-@]+$/", $match[2], $trailing) === 1) {
                    $rest = $trailing[0];
                }
            }

            return self::PUBLIC_PLACEHOLDER . $rest;
        }, $text) ?? $text;
    }

    /**
     * @return ?array{uid: string, displayName: string}
     */
    private function account(int $fileId, string $written): ?array
    {
        if ($written === '') {
            return null;
        }
        $key = $fileId . '/' . $written;
        if (!array_key_exists($key, $this->accounts)) {
            $this->accounts[$key] = $this->resolve($fileId, $written);
        }

        return $this->accounts[$key];
    }

    /**
     * Who an id names, if the reader may be shown them: the account exists, can open the
     * file, and is among those Nextcloud's people search lets this reader find. A reader is
     * always shown themselves. Every other case is null, and the caller cannot tell which.
     *
     * @return ?array{uid: string, displayName: string}
     */
    private function resolve(int $fileId, string $written): ?array
    {
        $user = $this->users->get($written);
        if ($user === null) {
            return null;
        }
        $uid = $user->getUID();
        if ($this->access->forUser($fileId, $uid) === null) {
            return null;
        }
        if ($this->session->getUser()?->getUID() !== $uid && !$this->findable($uid, $written)) {
            return null;
        }

        return ['uid' => $uid, 'displayName' => $user->getDisplayName()];
    }

    /** Whether the people search, as the current user, finds this account for what was written */
    private function findable(string $uid, string $written): bool
    {
        foreach ($this->people->matching($written) as $found) {
            if (strcasecmp($found, $uid) === 0) {
                return true;
            }
        }

        return false;
    }
}
