<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCP\IUserManager;

/**
 * The people a note's text or a reply names with an @.
 *
 * The stored form is the one Nextcloud's own rich text editor writes: `@alice`, or
 * `@"alice smith"` for an id with a space in it. The stored text keeps the user id, so a
 * mention keeps meaning the same account when the person is renamed; what people read is
 * the display name, put in at read time (see NotesService::serialize) and never stored.
 *
 * A token is a mention only if it names an account that exists. An email address is not
 * one (the @ must not follow a letter, digit or underscore), and neither is an @ that
 * names nobody.
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

    /** @var array<string, ?array{uid: string, displayName: string}> accounts already looked up in this request */
    private array $accounts = [];

    /** @psalm-suppress PossiblyUnusedMethod Constructed by the DI container */
    public function __construct(
        private readonly IUserManager $users,
    ) {
    }

    /**
     * Every mention in a text, in order, each token with the account it names.
     *
     * @return list<array{start: int, length: int, token: string, uid: string, displayName: string, settled: bool}>
     *     `token` is the id as written, `uid` the account's own id; `settled` is false for a
     *     simple token that runs to the very end of the text, which may still be being typed
     */
    public function find(string $text): array
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
            $account = $this->account($written);
            $end = $offset + strlen($whole);

            // A simple token swallows the punctuation that follows it ("@alice." at the end
            // of a sentence), so give those characters back until it names someone
            while ($account === null && !$quoted && $written !== '' && preg_match('/[.\'\-@]$/', $written) === 1) {
                $written = substr($written, 0, -1);
                $end--;
                $account = $this->account($written);
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
    public function uids(string $text, bool $settledOnly = false): array
    {
        $uids = [];
        foreach ($this->find($text) as $mention) {
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
    public function names(string $text): array
    {
        $names = [];
        foreach ($this->find($text) as $mention) {
            $names[$mention['token']] = $mention['displayName'];
        }

        return $names;
    }

    /**
     * The text for someone who must not learn who was mentioned: every mention becomes
     * PUBLIC_PLACEHOLDER. Only mentions are touched, so what else was written is kept.
     */
    public function redact(string $text): string
    {
        $mentions = $this->find($text);
        if ($mentions === []) {
            return $text;
        }

        $out = '';
        $cursor = 0;
        foreach ($mentions as $mention) {
            $out .= substr($text, $cursor, $mention['start'] - $cursor) . self::PUBLIC_PLACEHOLDER;
            $cursor = $mention['start'] + $mention['length'];
        }

        return $out . substr($text, $cursor);
    }

    /**
     * @return ?array{uid: string, displayName: string}
     */
    private function account(string $written): ?array
    {
        if ($written === '') {
            return null;
        }
        if (!array_key_exists($written, $this->accounts)) {
            $user = $this->users->get($written);
            $this->accounts[$written] = $user === null ? null : ['uid' => $user->getUID(), 'displayName' => $user->getDisplayName()];
        }

        return $this->accounts[$written];
    }
}
