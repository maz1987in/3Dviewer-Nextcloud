<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Db;

use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

/**
 * @template-extends QBMapper<NoteReply>
 */
class NoteReplyMapper extends QBMapper
{
    /** Keeps each IN (...) list well under every database's parameter limit. */
    private const DELETE_CHUNK = 500;

    /** @psalm-suppress PossiblyUnusedMethod Constructed by the DI container */
    public function __construct(IDBConnection $db)
    {
        parent::__construct($db, 'threedviewer_note_replies', NoteReply::class);
    }

    /**
     * Every reply on a model, oldest first, so a thread keeps the order it was written in.
     *
     * @return NoteReply[]
     */
    public function findByFile(int $fileId): array
    {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('file_id', $qb->createNamedParameter($fileId, IQueryBuilder::PARAM_INT)))
            ->orderBy('id', 'ASC');

        return $this->findEntities($qb);
    }

    /**
     * @return NoteReply[] oldest first
     */
    public function findByNote(int $noteId): array
    {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('note_id', $qb->createNamedParameter($noteId, IQueryBuilder::PARAM_INT)))
            ->orderBy('id', 'ASC');

        return $this->findEntities($qb);
    }

    /**
     * A reply, but only if it is in the given note's thread. The caller has already
     * scoped the note to its model, so this is what keeps a reply id from reaching a
     * thread it was not written in.
     *
     * @throws DoesNotExistException
     */
    public function findInNote(int $noteId, int $replyId): NoteReply
    {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($replyId, IQueryBuilder::PARAM_INT)))
            ->andWhere($qb->expr()->eq('note_id', $qb->createNamedParameter($noteId, IQueryBuilder::PARAM_INT)));

        return $this->findEntity($qb);
    }

    public function countByNote(int $noteId): int
    {
        $qb = $this->db->getQueryBuilder();
        $qb->select($qb->func()->count('*', 'n'))
            ->from($this->getTableName())
            ->where($qb->expr()->eq('note_id', $qb->createNamedParameter($noteId, IQueryBuilder::PARAM_INT)));

        $result = $qb->executeQuery();
        $count = (int) $result->fetchOne();
        $result->closeCursor();

        return $count;
    }

    /**
     * Delete a note's whole thread.
     */
    public function deleteByNote(int $noteId): void
    {
        $qb = $this->db->getQueryBuilder();
        $qb->delete($this->getTableName())
            ->where($qb->expr()->eq('note_id', $qb->createNamedParameter($noteId, IQueryBuilder::PARAM_INT)));
        $qb->executeStatement();
    }

    /**
     * Delete replies whose note is gone: the threads of notes the orphan job removed along
     * with their model, and any that an interrupted delete left behind.
     *
     * @return int number of replies deleted
     */
    public function deleteDangling(): int
    {
        $qb = $this->db->getQueryBuilder();
        $qb->select('r.id')
            ->from($this->getTableName(), 'r')
            ->leftJoin('r', 'threedviewer_notes', 'n', $qb->expr()->eq('r.note_id', 'n.id'))
            ->where($qb->expr()->isNull('n.id'));

        $result = $qb->executeQuery();
        $ids = array_map('intval', $result->fetchAll(\PDO::FETCH_COLUMN));
        $result->closeCursor();

        $deleted = 0;
        foreach (array_chunk($ids, self::DELETE_CHUNK) as $chunk) {
            $delete = $this->db->getQueryBuilder();
            $delete->delete($this->getTableName())
                ->where($delete->expr()->in('id', $delete->createNamedParameter($chunk, IQueryBuilder::PARAM_INT_ARRAY)));
            $deleted += $delete->executeStatement();
        }

        return $deleted;
    }
}
