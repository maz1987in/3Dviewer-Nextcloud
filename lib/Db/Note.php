<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Db;

use OCP\AppFramework\Db\Entity;

/**
 * One shared annotation or measurement on a model.
 *
 * `payload` is the validated JSON document (see NotePayload); it is stored as text and
 * decoded by NotesService, never by callers.
 *
 * @method int getFileId()
 * @method void setFileId(int $fileId)
 * @method string getType()
 * @method void setType(string $type)
 * @method string getPayload()
 * @method void setPayload(string $payload)
 * @method string getAuthorUid()
 * @method void setAuthorUid(string $authorUid)
 * @method int getCreatedAt()
 * @method void setCreatedAt(int $createdAt)
 * @method int getUpdatedAt()
 * @method void setUpdatedAt(int $updatedAt)
 */
class Note extends Entity
{
    protected $fileId;
    protected $type;
    protected $payload;
    protected $authorUid;
    protected $createdAt;
    protected $updatedAt;

    public function __construct()
    {
        $this->addType('fileId', 'integer');
        $this->addType('type', 'string');
        $this->addType('payload', 'string');
        $this->addType('authorUid', 'string');
        $this->addType('createdAt', 'integer');
        $this->addType('updatedAt', 'integer');
    }
}
