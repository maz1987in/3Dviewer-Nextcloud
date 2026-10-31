<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Db;

use OCP\AppFramework\Db\Entity;

/**
 * The settings of one model that everyone who can open it shares.
 *
 * `unit` is a key of FileSettingsService::UNITS and `up` one of FileSettingsService::UPS,
 * each null for the format's own default.
 *
 * @method int getFileId()
 * @method void setFileId(int $fileId)
 * @method ?string getUnit()
 * @method void setUnit(?string $unit)
 * @method ?string getUp()
 * @method void setUp(?string $up)
 * @method string getUpdatedBy()
 * @method void setUpdatedBy(string $updatedBy)
 * @method int getUpdatedAt()
 * @method void setUpdatedAt(int $updatedAt)
 */
class FileSetting extends Entity
{
    protected $fileId;
    protected $unit;
    protected $up;
    protected $updatedBy;
    protected $updatedAt;

    public function __construct()
    {
        $this->addType('fileId', 'integer');
        $this->addType('unit', 'string');
        $this->addType('up', 'string');
        $this->addType('updatedBy', 'string');
        $this->addType('updatedAt', 'integer');
    }
}
