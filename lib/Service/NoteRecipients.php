<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCA\ThreeDViewer\Db\NoteMapper;
use OCP\Files\File;
use OCP\Share\IShareHelper;

/**
 * Who hears about a change to a model's notes.
 *
 * Two audiences, deliberately different. The Activity stream is a log of what happened to
 * a file, so every user who can open the file gets the entry. A notification asks for
 * someone's attention, so it goes only to the people with a stake in the model's notes —
 * its owner and whoever has written on it before — and never to the person who made the
 * change. In both, nobody who can't open the file is ever named: the audience for the
 * stream comes from the server's own access list for the file, and the one for
 * notifications is checked against the file again, because someone who wrote a note last
 * month may have lost access since.
 *
 * @psalm-suppress MissingDependency Nextcloud runtime provides dependent classes in full environment.
 */
class NoteRecipients
{
    /**
     * A file shared with a whole organisation would otherwise get thousands of stream
     * entries for each note anyone touches. Past this many, the stream entry goes to the
     * people with a stake in the notes only, as a notification does.
     */
    public const MAX_STREAM_RECIPIENTS = 500;

    /** @psalm-suppress PossiblyUnusedMethod Constructed by the DI container */
    public function __construct(
        private readonly IShareHelper $shares,
        private readonly NoteMapper $mapper,
        private readonly NoteAccess $access,
    ) {
    }

    /**
     * Everyone who can open the file, with the path they see it at, for the Activity stream.
     * The author of the change is included: the stream shows people their own actions too.
     *
     * @return array<array-key, string> user id => the file's path in that user's files, with a
     *     leading slash; PHP makes a numeric user id an int key, so cast it back to use it
     */
    public function forStream(File $file): array
    {
        $paths = self::userPaths($this->shares->getPathsForAccessList($file));

        if (count($paths) <= self::MAX_STREAM_RECIPIENTS) {
            return $paths;
        }

        return array_intersect_key($paths, array_flip($this->involved($file)));
    }

    /**
     * The people to notify about a change by `$actor`: the file's owner and everyone who
     * has made a note on it, who can still open it, except the actor.
     *
     * @return list<string> user ids
     */
    public function forNotification(File $file, NoteActor $actor): array
    {
        $fileId = $file->getId();
        $recipients = [];
        foreach ($this->involved($file) as $uid) {
            if ($actor->isUser() && $uid === $actor->value) {
                continue;
            }
            // A visitor's notes are filed under a made-up id (NoteActor::authorKey), not an account
            if (str_starts_with($uid, 'guest:')) {
                continue;
            }
            if ($this->access->forUser($fileId, $uid) === null) {
                continue;
            }
            $recipients[] = $uid;
        }

        return $recipients;
    }

    /**
     * The `users` part of what getPathsForAccessList() answers, each path with a leading
     * slash. Taken as `mixed` because the server's own description of that answer differs
     * between versions, from a bare `array` to a typed shape.
     *
     * @return array<array-key, string>
     */
    private static function userPaths(mixed $access): array
    {
        if (!is_array($access) || !isset($access['users']) || !is_array($access['users'])) {
            return [];
        }
        $paths = array_map(static fn (mixed $path): string => is_string($path) ? '/' . ltrim($path, '/') : '', $access['users']);

        return array_filter($paths, static fn (string $path): bool => $path !== '');
    }

    /**
     * The owner of the file and everyone who has made a note on it, once each.
     *
     * @return list<string>
     */
    private function involved(File $file): array
    {
        $uids = $this->mapper->findAuthorUids($file->getId());
        $owner = $file->getOwner()?->getUID();
        if ($owner !== null) {
            array_unshift($uids, $owner);
        }

        return array_values(array_unique($uids));
    }
}
