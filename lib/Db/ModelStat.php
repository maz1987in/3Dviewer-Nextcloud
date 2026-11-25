<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Db;

use OCP\AppFramework\Db\Entity;

/**
 * The numbers measured from one version of a model: what the Files sidebar's "3D" tab shows.
 *
 * `etag` is the version of the file they were measured from, and `stats` is the JSON
 * ModelStatsService validated before it was stored.
 *
 * @method int getFileId()
 * @method void setFileId(int $fileId)
 * @method string getEtag()
 * @method void setEtag(string $etag)
 * @method string getStats()
 * @method void setStats(string $stats)
 * @method string getCreatedBy()
 * @method void setCreatedBy(string $createdBy)
 * @method int getCreatedAt()
 * @method void setCreatedAt(int $createdAt)
 */
class ModelStat extends Entity
{
    protected $fileId;
    protected $etag;
    protected $stats;
    protected $createdBy;
    protected $createdAt;

    public function __construct()
    {
        $this->addType('fileId', 'integer');
        $this->addType('etag', 'string');
        $this->addType('stats', 'string');
        $this->addType('createdBy', 'string');
        $this->addType('createdAt', 'integer');
    }
}
