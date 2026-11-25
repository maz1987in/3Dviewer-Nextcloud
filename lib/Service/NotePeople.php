<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCP\Collaboration\Collaborators\ISearch;

/**
 * The people offered when someone types an @ in a note or a reply.
 *
 * Nextcloud's own people search does the finding — the one behind the share dialog and
 * the core autocomplete, so the administrator's rules about who may be listed to whom
 * (the user enumeration and group restriction settings) apply as they do everywhere else.
 * It knows nothing of a particular file, though, so each candidate is then checked against
 * the model: only a person who can open it is offered. A mention of anyone else would be
 * dropped when the note is published anyway (see NoteChangePublisher); offering them would
 * only promise something that cannot happen.
 *
 * @psalm-suppress MissingDependency Nextcloud runtime provides dependent classes in full environment.
 */
class NotePeople
{
    /** How many people one search offers */
    public const LIMIT = 10;

    /**
     * How many candidates to ask the directory for. More than are offered, because those
     * who can't open the model are dropped from them.
     */
    private const CANDIDATES = 50;

    /** The share type of a user, as the share dialog and the core autocomplete name it */
    private const SHARE_TYPE_USER = 0;

    /** @psalm-suppress PossiblyUnusedMethod Constructed by the DI container */
    public function __construct(
        private readonly ISearch $search,
        private readonly NoteAccess $access,
    ) {
    }

    /**
     * @return list<array{id: string, label: string}> people who can open the model, other
     *     than the searcher, best match first
     */
    public function search(int $fileId, string $searcherUid, string $query): array
    {
        [$results] = $this->search->search(mb_substr($query, 0, 64), [self::SHARE_TYPE_USER], false, self::CANDIDATES, 0);

        $people = [];
        foreach ($this->candidates($results) as [$uid, $label]) {
            if ($uid === $searcherUid || $this->access->forUser($fileId, $uid) === null) {
                continue;
            }
            $people[] = ['id' => $uid, 'label' => $label];
            if (count($people) >= self::LIMIT) {
                break;
            }
        }

        return $people;
    }

    /**
     * Exact matches first, then the rest, as the share dialog orders them.
     *
     * @param mixed $results what ISearch::search() answers; its own description of it
     *     differs between server versions, so it is read defensively
     * @return list<array{0: string, 1: string}> user id and display name, each user once
     */
    private function candidates(mixed $results): array
    {
        if (!is_array($results)) {
            return [];
        }

        $exact = isset($results['exact']) && is_array($results['exact']) && isset($results['exact']['users']) && is_array($results['exact']['users'])
            ? $results['exact']['users']
            : [];
        $others = isset($results['users']) && is_array($results['users']) ? $results['users'] : [];

        $candidates = [];
        $seen = [];
        foreach ([...$exact, ...$others] as $entry) {
            if (!is_array($entry)) {
                continue;
            }
            /** @psalm-suppress MixedAssignment checked below */
            $value = $entry['value'] ?? null;
            /** @psalm-suppress MixedAssignment checked below */
            $uid = is_array($value) ? ($value['shareWith'] ?? null) : null;
            // Keyed with a prefix: PHP turns a purely numeric user id into an int key
            if (!is_string($uid) || $uid === '' || isset($seen['u' . $uid])) {
                continue;
            }
            $seen['u' . $uid] = true;
            /** @psalm-suppress MixedAssignment checked below */
            $label = $entry['label'] ?? null;
            $candidates[] = [$uid, is_string($label) && $label !== '' ? $label : $uid];
        }

        return $candidates;
    }
}
