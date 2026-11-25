<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCA\ThreeDViewer\Db\Note;
use OCA\ThreeDViewer\Db\NoteMapper;
use OCA\ThreeDViewer\Db\NoteReply;
use OCA\ThreeDViewer\Db\NoteReplyMapper;
use OCA\ThreeDViewer\Service\Exception\InvalidNoteException;
use OCA\ThreeDViewer\Service\Exception\NoteLimitException;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\IDBConnection;
use OCP\IUserManager;
use OCP\Lock\ILockingProvider;
use OCP\Lock\LockedException;
use Psr\Log\LoggerInterface;

/**
 * The shared annotations and measurements of a model.
 *
 * Callers are expected to have checked access with NoteAccess first; nothing here knows
 * who may do what.
 */
class NotesService
{
    public const MAX_NOTES_PER_FILE = 1000;

    /** A thread this long is a conversation that belongs somewhere else; the limit stops a runaway client */
    public const MAX_REPLIES_PER_NOTE = 200;

    /** @var array<string, ?string> display names already looked up in this request */
    private array $displayNames = [];

    /** @psalm-suppress PossiblyUnusedMethod Constructed by the DI container */
    public function __construct(
        private readonly NoteMapper $mapper,
        private readonly NoteReplyMapper $replies,
        private readonly NoteMentions $mentions,
        private readonly AnnotationsService $legacy,
        private readonly IUserManager $users,
        private readonly IDBConnection $db,
        private readonly ILockingProvider $locking,
        private readonly ITimeFactory $time,
        private readonly LoggerInterface $logger,
    ) {
    }

    /** @return Note[] */
    public function list(int $fileId): array
    {
        return $this->mapper->findByFile($fileId);
    }

    /**
     * @throws DoesNotExistException when the note isn't on that model
     */
    public function find(int $fileId, int $noteId): Note
    {
        return $this->mapper->findInFile($fileId, $noteId);
    }

    /**
     * The limit is checked before the insert rather than enforced by the database, so two
     * simultaneous creates can land one over it. It exists to stop a runaway client, not
     * to count exactly.
     *
     * @throws InvalidNoteException
     * @throws NoteLimitException
     */
    public function create(int $fileId, string $type, mixed $payload, string $uid): Note
    {
        $normalized = NotePayload::validate($type, $payload);
        if ($this->mapper->countByFile($fileId) >= self::MAX_NOTES_PER_FILE) {
            throw new NoteLimitException('This model already has the maximum number of notes');
        }

        return $this->mapper->insert($this->newNote($fileId, $type, $normalized, $uid, $this->time->getTime()));
    }

    /**
     * @throws DoesNotExistException
     * @throws InvalidNoteException
     */
    public function update(int $fileId, int $noteId, mixed $payload): Note
    {
        $note = $this->mapper->findInFile($fileId, $noteId);
        $normalized = NotePayload::validate($note->getType(), $payload);
        $note->setPayload(NotePayload::encode($normalized));
        $note->setUpdatedAt($this->time->getTime());

        return $this->mapper->update($note);
    }

    /**
     * Delete a note and its replies, together: a thread is nothing without the note it is
     * under, and nothing should be left that a later note could be handed the id of.
     *
     * @throws DoesNotExistException
     */
    public function delete(int $fileId, int $noteId): void
    {
        $note = $this->mapper->findInFile($fileId, $noteId);

        $this->db->beginTransaction();

        try {
            $this->replies->deleteByNote($noteId);
            $this->mapper->delete($note);
            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();

            throw $e;
        }
    }

    /**
     * Resolve a note, or open it again.
     *
     * Resolving a note that is resolved already, or reopening one that is open, changes
     * nothing — and the caller is told, so it does not announce a change that did not
     * happen. Who resolved a note and when is kept only while it is resolved: reopening
     * clears both, and a note resolved again is a new resolution by whoever did it.
     *
     * @param string $uid who is making the change
     * @return array{0: Note, 1: bool} the note as it is now, and whether this call changed it
     * @throws DoesNotExistException
     * @throws InvalidNoteException when the state is not one a note can have
     */
    public function changeState(int $fileId, int $noteId, string $state, string $uid): array
    {
        if (!in_array($state, Note::STATES, true)) {
            throw new InvalidNoteException('Unknown state');
        }
        $note = $this->mapper->findInFile($fileId, $noteId);
        if ($note->getState() === $state) {
            return [$note, false];
        }

        $resolved = $state === Note::STATE_RESOLVED;
        $note->setState($state);
        $note->setResolvedBy($resolved ? $uid : null);
        $note->setResolvedAt($resolved ? $this->time->getTime() : null);

        return [$this->mapper->update($note), true];
    }

    /**
     * Every note of a model as the API returns it, each with its thread. The replies are
     * read once for the whole model, not once per note.
     *
     * @param bool $withAuthor false for a public link, which gets no names and no mentions
     * @return list<array<string, mixed>>
     */
    public function serializeAll(int $fileId, bool $withAuthor): array
    {
        $threads = [];
        foreach ($this->replies->findByFile($fileId) as $reply) {
            $threads[$reply->getNoteId()][] = $reply;
        }

        $serialized = [];
        foreach ($this->list($fileId) as $note) {
            $serialized[] = $this->serialize($note, $withAuthor, $threads[$note->getId()] ?? []);
        }

        return $serialized;
    }

    /**
     * One note with its thread, as the API returns it.
     *
     * @return array<string, mixed>
     */
    public function serializeWithThread(Note $note, bool $withAuthor): array
    {
        return $this->serialize($note, $withAuthor, $this->replies->findByNote($note->getId()));
    }

    /**
     * @throws DoesNotExistException when the note isn't on that model
     * @throws InvalidNoteException
     * @throws NoteLimitException
     */
    public function addReply(int $fileId, int $noteId, mixed $text, string $uid): NoteReply
    {
        $clean = NotePayload::replyText($text);
        $this->mapper->findInFile($fileId, $noteId);
        if ($this->replies->countByNote($noteId) >= self::MAX_REPLIES_PER_NOTE) {
            throw new NoteLimitException('This note already has the maximum number of replies');
        }

        $now = $this->time->getTime();
        $reply = new NoteReply();
        $reply->setNoteId($noteId);
        $reply->setFileId($fileId);
        $reply->setText($clean);
        $reply->setAuthorUid($uid);
        $reply->setCreatedAt($now);
        $reply->setUpdatedAt($now);

        return $this->replies->insert($reply);
    }

    /**
     * @throws DoesNotExistException when the note isn't on that model or the reply isn't in its thread
     */
    public function findReply(int $fileId, int $noteId, int $replyId): NoteReply
    {
        $this->mapper->findInFile($fileId, $noteId);

        return $this->replies->findInNote($noteId, $replyId);
    }

    /**
     * @throws DoesNotExistException
     * @throws InvalidNoteException
     */
    public function updateReply(int $fileId, int $noteId, int $replyId, mixed $text): NoteReply
    {
        $clean = NotePayload::replyText($text);
        $reply = $this->findReply($fileId, $noteId, $replyId);
        $reply->setText($clean);
        $reply->setUpdatedAt($this->time->getTime());

        return $this->replies->update($reply);
    }

    /**
     * @throws DoesNotExistException
     */
    public function deleteReply(int $fileId, int $noteId, int $replyId): void
    {
        $this->replies->delete($this->findReply($fileId, $noteId, $replyId));
    }

    /**
     * Move the caller's pre-3.6 private annotations for this model into the shared set.
     *
     * An editor's annotations become shared notes, authored by them, in scene space until
     * the viewer converts them. Someone who can't edit the model can't write to the
     * shared set, migration or not, so their annotations stay where they are and come
     * back as private notes only they see. An editor gets private notes back too when the
     * move couldn't happen — the model is already at its note limit, the document isn't a
     * recognizable annotation export, or the shared insert failed — so nothing is lost
     * even though nothing moved; the legacy document is left in place in every one of
     * those cases.
     *
     * @return list<array<string, mixed>> private notes; empty once everything has moved
     */
    public function migrateLegacy(int $fileId, string $uid, bool $canEdit): array
    {
        $raw = $this->legacy->load($fileId, $uid);
        if ($raw === null) {
            return [];
        }

        if (!$canEdit) {
            return $this->privateNotes($this->legacyItems($raw) ?? [], $uid);
        }

        // Two tabs opening the model at once would otherwise both read the document and
        // both insert it. Whoever doesn't get the lock skips the move this time. The key
        // is hashed rather than built from the raw uid because a DB-backed locking
        // provider stores it in a VARCHAR(64) column, and some identity providers (LDAP
        // UUIDs, OIDC subject hashes) hand out uids that would overflow it on their own.
        $lockKey = 'threedviewer/legacy-notes/' . md5($uid . '/' . $fileId);

        try {
            $this->locking->acquireLock($lockKey, ILockingProvider::LOCK_EXCLUSIVE);
        } catch (LockedException) {
            return [];
        }

        try {
            // Re-read under the lock: the request that held it may have finished the move.
            $raw = $this->legacy->load($fileId, $uid);
            if ($raw === null) {
                return [];
            }

            $items = $this->legacyItems($raw);
            if ($items === null) {
                $this->logger->warning('NotesService: legacy annotation document could not be parsed; left in place', [
                    'fileId' => $fileId,
                ]);

                return [];
            }

            if ($this->moveToShared($fileId, $uid, $items)) {
                return [];
            }

            return $this->privateNotes($items, $uid);
        } finally {
            $this->locking->releaseLock($lockKey, ILockingProvider::LOCK_EXCLUSIVE);
        }
    }

    /**
     * @param bool $withAuthor false for a public link: no names of authors or of whoever
     *     resolved the note, and every mention is hidden (see NoteMentions::redact), so a
     *     link hands out no more of the people involved than it did before notes had threads
     * @param NoteReply[] $replies the note's thread, oldest first
     * @return array<string, mixed>
     */
    public function serialize(Note $note, bool $withAuthor, array $replies = []): array
    {
        /** @psalm-suppress MixedAssignment a payload this app wrote; read defensively all the same */
        $payload = json_decode($note->getPayload(), true);
        $mentions = [];
        if (is_array($payload) && isset($payload['text']) && is_string($payload['text'])) {
            if ($withAuthor) {
                $mentions = $this->mentions->names($payload['text'], $note->getFileId());
            } else {
                $payload['text'] = $this->mentions->redact($payload['text']);
            }
        }
        $resolved = $note->getState() === Note::STATE_RESOLVED;
        $resolvedBy = $note->getResolvedBy();

        return [
            'id' => $note->getId(),
            'type' => $note->getType(),
            'payload' => $payload,
            'author' => $withAuthor ? $this->author($note->getAuthorUid()) : null,
            'createdAt' => $note->getCreatedAt(),
            'updatedAt' => $note->getUpdatedAt(),
            'state' => $resolved ? Note::STATE_RESOLVED : Note::STATE_OPEN,
            'resolvedBy' => $resolved && $withAuthor && $resolvedBy !== null ? $this->author($resolvedBy) : null,
            'resolvedAt' => $resolved ? $note->getResolvedAt() : null,
            'mentions' => $mentions,
            'replies' => array_map(fn (NoteReply $reply) => $this->serializeReply($reply, $withAuthor), array_values($replies)),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function serializeReply(NoteReply $reply, bool $withAuthor): array
    {
        return [
            'id' => $reply->getId(),
            'text' => $withAuthor ? $reply->getText() : $this->mentions->redact($reply->getText()),
            'author' => $withAuthor ? $this->author($reply->getAuthorUid()) : null,
            'createdAt' => $reply->getCreatedAt(),
            'updatedAt' => $reply->getUpdatedAt(),
            'mentions' => $withAuthor ? $this->mentions->names($reply->getText(), $reply->getFileId()) : [],
        ];
    }

    /**
     * Insert every item as a shared note and remove the legacy document, atomically.
     *
     * Nothing is moved unless all of it fits: a partial move would strand the rest in a
     * document that migrateLegacy has already decided to delete, so hitting the limit
     * keeps the whole document in place and lets the caller keep the items private
     * instead.
     *
     * @param list<array{payload: array<string, mixed>, createdAt: int}> $items
     * @return bool whether the items were moved into shared notes
     */
    private function moveToShared(int $fileId, string $uid, array $items): bool
    {
        $room = max(0, self::MAX_NOTES_PER_FILE - $this->mapper->countByFile($fileId));
        if (count($items) > $room) {
            $this->logger->warning('NotesService: legacy annotations left private; the model is at its note limit', [
                'fileId' => $fileId,
                'count' => count($items),
                'room' => $room,
            ]);

            return false;
        }

        $this->db->beginTransaction();

        try {
            foreach ($items as $item) {
                $this->mapper->insert($this->newNote($fileId, 'annotation', $item['payload'], $uid, $item['createdAt']));
            }
            // Deleting the legacy document before commit() is what makes the move happen
            // once instead of being retried forever: if it can't be removed, the inserts
            // are rolled back and the caller gets the items back as private notes. This
            // chooses exactly-once over at-least-once — a commit() failure after a
            // successful delete would still lose the notes it carried, and that narrow
            // window is an accepted trade-off.
            if (!$this->legacy->delete($fileId, $uid)) {
                throw new \RuntimeException('Could not remove the legacy annotation document');
            }
            $this->db->commit();

            return true;
        } catch (\Throwable $e) {
            $this->db->rollBack();
            $this->logger->error('NotesService: legacy annotation migration failed', [
                'fileId' => $fileId,
                'exception' => $e,
            ]);

            return false;
        }
    }

    /**
     * @return null|list<array{payload: array<string, mixed>, createdAt: int}> null when
     *     the document isn't a recognizable annotation export
     */
    private function legacyItems(string $raw): ?array
    {
        $doc = json_decode($raw, true);
        if (!is_array($doc) || !is_array($doc['annotations'] ?? null)) {
            return null;
        }

        $items = [];
        foreach ($doc['annotations'] as $annotation) {
            if (!is_array($annotation)) {
                continue;
            }
            $text = isset($annotation['text']) && is_string($annotation['text']) ? mb_substr($annotation['text'], 0, NotePayload::MAX_TEXT_CHARS) : '';

            try {
                $payload = NotePayload::validate('annotation', [
                    'space' => 'scene',
                    'point' => $annotation['point'] ?? null,
                    'text' => $text,
                ], true);
            } catch (InvalidNoteException) {
                continue;
            }
            $timestamp = isset($annotation['timestamp']) && is_string($annotation['timestamp']) ? strtotime($annotation['timestamp']) : false;
            $items[] = ['payload' => $payload, 'createdAt' => $timestamp === false ? $this->time->getTime() : $timestamp];
        }

        return $items;
    }

    /**
     * @param list<array{payload: array<string, mixed>, createdAt: int}> $items
     * @return list<array<string, mixed>>
     */
    private function privateNotes(array $items, string $uid): array
    {
        $notes = [];
        foreach ($items as $index => $item) {
            $notes[] = [
                'id' => 'private-' . $index,
                'type' => 'annotation',
                'payload' => $item['payload'],
                'author' => $this->author($uid),
                'createdAt' => $item['createdAt'],
                'updatedAt' => $item['createdAt'],
            ];
        }

        return $notes;
    }

    /**
     * @param array<string, mixed> $normalized
     */
    private function newNote(int $fileId, string $type, array $normalized, string $uid, int $createdAt): Note
    {
        $note = new Note();
        $note->setFileId($fileId);
        $note->setType($type);
        $note->setPayload(NotePayload::encode($normalized));
        $note->setAuthorUid($uid);
        $note->setCreatedAt($createdAt);
        $note->setUpdatedAt($createdAt);

        return $note;
    }

    /**
     * @return ?array{uid: string, displayName: string}
     */
    private function author(string $uid): ?array
    {
        if (!array_key_exists($uid, $this->displayNames)) {
            $this->displayNames[$uid] = $this->users->getDisplayName($uid);
        }
        $name = $this->displayNames[$uid];

        return $name === null ? null : ['uid' => $uid, 'displayName' => $name];
    }
}
