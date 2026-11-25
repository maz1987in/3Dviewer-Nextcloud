<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Db;

use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

/**
 * @template-extends QBMapper<ModelStat>
 */
class ModelStatMapper extends QBMapper
{
    /** Keeps each IN (...) list well under every database's parameter limit. */
    private const CHUNK = 500;

    /** @psalm-suppress PossiblyUnusedMethod Constructed by the DI container */
    public function __construct(IDBConnection $db)
    {
        parent::__construct($db, 'threedviewer_model_stats', ModelStat::class);
    }

    /** The model's statistics, of whichever version they were measured from, or null. */
    public function findByFile(int $fileId): ?ModelStat
    {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('file_id', $qb->createNamedParameter($fileId, IQueryBuilder::PARAM_INT)));

        try {
            return $this->findEntity($qb);
        } catch (DoesNotExistException) {
            return null;
        }
    }

    /**
     * The version each of the given models was measured from, for those that were.
     *
     * @param list<int> $fileIds
     * @return array<int, string> ETag by file id
     */
    public function findEtags(array $fileIds): array
    {
        $etags = [];
        foreach (array_chunk($fileIds, self::CHUNK) as $chunk) {
            $qb = $this->db->getQueryBuilder();
            $qb->select('file_id', 'etag')
                ->from($this->getTableName())
                ->where($qb->expr()->in('file_id', $qb->createNamedParameter($chunk, IQueryBuilder::PARAM_INT_ARRAY)));

            $result = $qb->executeQuery();
            $rows = $result->fetchAll();
            $result->closeCursor();
            foreach ($rows as $row) {
                $etags[(int) $row['file_id']] = (string) $row['etag'];
            }
        }

        return $etags;
    }

    public function deleteByFile(int $fileId): void
    {
        $qb = $this->db->getQueryBuilder();
        $qb->delete($this->getTableName())
            ->where($qb->expr()->eq('file_id', $qb->createNamedParameter($fileId, IQueryBuilder::PARAM_INT)));
        $qb->executeStatement();
    }

    /**
     * Delete the statistics of models that no longer exist anywhere.
     *
     * A file in the trash keeps its filecache row, so a model restored from the trash
     * comes back with its statistics; only a permanently deleted model loses them.
     *
     * @return int number of rows deleted
     */
    public function deleteOrphans(): int
    {
        $qb = $this->db->getQueryBuilder();
        $qb->selectDistinct('s.file_id')
            ->from($this->getTableName(), 's')
            ->leftJoin('s', 'filecache', 'f', $qb->expr()->eq('s.file_id', 'f.fileid'))
            ->where($qb->expr()->isNull('f.fileid'));

        $result = $qb->executeQuery();
        $orphanFileIds = array_map('intval', $result->fetchAll(\PDO::FETCH_COLUMN));
        $result->closeCursor();

        $deleted = 0;
        foreach (array_chunk($orphanFileIds, self::CHUNK) as $chunk) {
            $delete = $this->db->getQueryBuilder();
            $delete->delete($this->getTableName())
                ->where($delete->expr()->in('file_id', $delete->createNamedParameter($chunk, IQueryBuilder::PARAM_INT_ARRAY)));
            $deleted += $delete->executeStatement();
        }

        return $deleted;
    }
}
