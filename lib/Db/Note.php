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
 * @method string getState()
 * @method void setState(string $state)
 * @method ?string getResolvedBy()
 * @method void setResolvedBy(?string $resolvedBy)
 * @method ?int getResolvedAt()
 * @method void setResolvedAt(?int $resolvedAt)
 */
class Note extends Entity
{
    /** Waiting for someone to deal with it; what every note starts as */
    public const STATE_OPEN = 'open';

    /** Dealt with: `resolvedBy` and `resolvedAt` say who and when */
    public const STATE_RESOLVED = 'resolved';

    public const STATES = [self::STATE_OPEN, self::STATE_RESOLVED];

    protected $fileId;
    protected $type;
    protected $payload;
    protected $authorUid;
    protected $createdAt;
    protected $updatedAt;
    protected $state = self::STATE_OPEN;
    protected $resolvedBy;
    protected $resolvedAt;

    public function __construct()
    {
        $this->addType('fileId', 'integer');
        $this->addType('type', 'string');
        $this->addType('payload', 'string');
        $this->addType('authorUid', 'string');
        $this->addType('createdAt', 'integer');
        $this->addType('updatedAt', 'integer');
        $this->addType('state', 'string');
        $this->addType('resolvedBy', 'string');
        $this->addType('resolvedAt', 'integer');
    }
}
