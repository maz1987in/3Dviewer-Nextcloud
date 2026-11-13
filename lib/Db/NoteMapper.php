<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Db;

use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

/**
 * @template-extends QBMapper<Note>
 */
class NoteMapper extends QBMapper
{
    /** Keeps each IN (...) list well under every database's parameter limit. */
    private const DELETE_CHUNK = 500;

    /** @psalm-suppress PossiblyUnusedMethod Constructed by the DI container */
    public function __construct(IDBConnection $db)
    {
        parent::__construct($db, 'threedviewer_notes', Note::class);
    }

    /**
     * @return Note[] oldest first, so notes keep the order they were made in
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
     * A note, but only if it belongs to the given model. Scoping by file id is what stops
     * a caller with edit rights on one model from reaching notes on another.
     *
     * @throws DoesNotExistException
     */
    public function findInFile(int $fileId, int $noteId): Note
    {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($noteId, IQueryBuilder::PARAM_INT)))
            ->andWhere($qb->expr()->eq('file_id', $qb->createNamedParameter($fileId, IQueryBuilder::PARAM_INT)));

        return $this->findEntity($qb);
    }

    /**
     * The newest notes one author made on a model, newest first.
     *
     * @return Note[]
     */
    public function findRecentByAuthor(int $fileId, string $authorUid, int $limit): array
    {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('file_id', $qb->createNamedParameter($fileId, IQueryBuilder::PARAM_INT)))
            ->andWhere($qb->expr()->eq('author_uid', $qb->createNamedParameter($authorUid)))
            ->orderBy('id', 'DESC')
            ->setMaxResults($limit);

        return $this->findEntities($qb);
    }

    /**
     * Everyone who has made a note on a model, once each.
     *
     * @return list<string>
     */
    public function findAuthorUids(int $fileId): array
    {
        $qb = $this->db->getQueryBuilder();
        $qb->selectDistinct('author_uid')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('file_id', $qb->createNamedParameter($fileId, IQueryBuilder::PARAM_INT)));

        $result = $qb->executeQuery();
        $uids = array_map(static fn (mixed $uid): string => is_scalar($uid) ? (string) $uid : '', $result->fetchAll(\PDO::FETCH_COLUMN));
        $result->closeCursor();

        return array_values(array_filter($uids, static fn (string $uid): bool => $uid !== ''));
    }

    public function countByFile(int $fileId): int
    {
        $qb = $this->db->getQueryBuilder();
        $qb->select($qb->func()->count('*', 'n'))
            ->from($this->getTableName())
            ->where($qb->expr()->eq('file_id', $qb->createNamedParameter($fileId, IQueryBuilder::PARAM_INT)));

        $result = $qb->executeQuery();
        $count = (int) $result->fetchOne();
        $result->closeCursor();

        return $count;
    }

    /**
     * The ids of the notes deleteOrphans() would delete, so what refers to them — a
     * notification — can be removed as well.
     *
     * @return list<int>
     */
    public function findOrphanNoteIds(): array
    {
        $qb = $this->db->getQueryBuilder();
        $qb->select('n.id')
            ->from($this->getTableName(), 'n')
            ->leftJoin('n', 'filecache', 'f', $qb->expr()->eq('n.file_id', 'f.fileid'))
            ->where($qb->expr()->isNull('f.fileid'));

        $result = $qb->executeQuery();
        $ids = array_map('intval', $result->fetchAll(\PDO::FETCH_COLUMN));
        $result->closeCursor();

        return array_values($ids);
    }

    /**
     * Delete notes whose model no longer exists anywhere.
     *
     * A file in the trash keeps its filecache row, so a model restored from the trash
     * comes back with its notes; only a permanently deleted model loses them.
     *
     * @return int number of notes deleted
     */
    public function deleteOrphans(): int
    {
        $qb = $this->db->getQueryBuilder();
        $qb->selectDistinct('n.file_id')
            ->from($this->getTableName(), 'n')
            ->leftJoin('n', 'filecache', 'f', $qb->expr()->eq('n.file_id', 'f.fileid'))
            ->where($qb->expr()->isNull('f.fileid'));

        $result = $qb->executeQuery();
        $orphanFileIds = array_map('intval', $result->fetchAll(\PDO::FETCH_COLUMN));
        $result->closeCursor();

        $deleted = 0;
        foreach (array_chunk($orphanFileIds, self::DELETE_CHUNK) as $chunk) {
            $delete = $this->db->getQueryBuilder();
            $delete->delete($this->getTableName())
                ->where($delete->expr()->in('file_id', $delete->createNamedParameter($chunk, IQueryBuilder::PARAM_INT_ARRAY)));
            $deleted += $delete->executeStatement();
        }

        return $deleted;
    }
}
