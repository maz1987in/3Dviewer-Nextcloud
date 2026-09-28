<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCA\ThreeDViewer\Db\Note;
use OCA\ThreeDViewer\Db\NoteMapper;
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

    /** @var array<string, ?string> display names already looked up in this request */
    private array $displayNames = [];

    public function __construct(
        private readonly NoteMapper $mapper,
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
     * @throws DoesNotExistException
     */
    public function delete(int $fileId, int $noteId): void
    {
        $this->mapper->delete($this->mapper->findInFile($fileId, $noteId));
    }

    /**
     * Move the caller's pre-3.6 private annotations for this model into the shared set.
     *
     * An editor's annotations become shared notes, authored by them, in scene space until
     * the viewer converts them. Someone who can't edit the model can't write to the
     * shared set, migration or not, so their annotations stay where they are and come
     * back as private notes only they see.
     *
     * @return list<array<string, mixed>> private notes; empty for editors
     */
    public function migrateLegacy(int $fileId, string $uid, bool $canEdit): array
    {
        $raw = $this->legacy->load($fileId, $uid);
        if ($raw === null) {
            return [];
        }

        if (!$canEdit) {
            return $this->privateNotes($this->legacyItems($raw), $uid);
        }

        // Two tabs opening the model at once would otherwise both read the document and
        // both insert it. Whoever doesn't get the lock skips the move this time.
        $lockKey = 'threedviewer/legacy-notes/' . $uid . '/' . $fileId;

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
            $this->moveToShared($fileId, $uid, $this->legacyItems($raw));
        } finally {
            $this->locking->releaseLock($lockKey, ILockingProvider::LOCK_EXCLUSIVE);
        }

        return [];
    }

    /**
     * @return array{id: int|string, type: string, payload: mixed, author: ?array{uid: string, displayName: string}, createdAt: int, updatedAt: int}
     */
    public function serialize(Note $note, bool $withAuthor): array
    {
        return [
            'id' => $note->getId(),
            'type' => $note->getType(),
            'payload' => json_decode($note->getPayload(), true),
            'author' => $withAuthor ? $this->author($note->getAuthorUid()) : null,
            'createdAt' => $note->getCreatedAt(),
            'updatedAt' => $note->getUpdatedAt(),
        ];
    }

    /**
     * @param list<array{payload: array<string, mixed>, createdAt: int}> $items
     */
    private function moveToShared(int $fileId, string $uid, array $items): void
    {
        $room = max(0, self::MAX_NOTES_PER_FILE - $this->mapper->countByFile($fileId));
        if (count($items) > $room) {
            $this->logger->warning('NotesService: legacy annotations over the note limit were dropped', [
                'fileId' => $fileId,
                'dropped' => count($items) - $room,
            ]);
        }

        $this->db->beginTransaction();

        try {
            foreach (array_slice($items, 0, $room) as $item) {
                $this->mapper->insert($this->newNote($fileId, 'annotation', $item['payload'], $uid, $item['createdAt']));
            }
            // Removing the document inside the transaction is what makes the move happen
            // once: if it can't be removed, the inserts are rolled back and the next open
            // tries again from the same document.
            if (!$this->legacy->delete($fileId, $uid)) {
                throw new \RuntimeException('Could not remove the legacy annotation document');
            }
            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            $this->logger->error('NotesService: legacy annotation migration failed', [
                'fileId' => $fileId,
                'exception' => $e,
            ]);
        }
    }

    /**
     * @return list<array{payload: array<string, mixed>, createdAt: int}>
     */
    private function legacyItems(string $raw): array
    {
        $doc = json_decode($raw, true);
        if (!is_array($doc) || !is_array($doc['annotations'] ?? null)) {
            return [];
        }

        $items = [];
        foreach ($doc['annotations'] as $annotation) {
            if (!is_array($annotation)) {
                continue;
            }
            $text = is_string($annotation['text'] ?? null) ? mb_substr($annotation['text'], 0, NotePayload::MAX_TEXT_CHARS) : '';

            try {
                $payload = NotePayload::validate('annotation', [
                    'space' => 'scene',
                    'point' => $annotation['point'] ?? null,
                    'text' => $text,
                ], true);
            } catch (InvalidNoteException) {
                continue;
            }
            $timestamp = is_string($annotation['timestamp'] ?? null) ? strtotime($annotation['timestamp']) : false;
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
