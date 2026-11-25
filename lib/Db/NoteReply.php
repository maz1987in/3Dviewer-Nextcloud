<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Db;

use OCP\AppFramework\Db\Entity;

/**
 * One reply in the thread under a note: text only, no position of its own.
 *
 * `text` may carry @mentions in the stored form NoteMentions reads; it is plain text and
 * is never interpreted as markup.
 *
 * @method int getNoteId()
 * @method void setNoteId(int $noteId)
 * @method int getFileId()
 * @method void setFileId(int $fileId)
 * @method string getText()
 * @method void setText(string $text)
 * @method string getAuthorUid()
 * @method void setAuthorUid(string $authorUid)
 * @method int getCreatedAt()
 * @method void setCreatedAt(int $createdAt)
 * @method int getUpdatedAt()
 * @method void setUpdatedAt(int $updatedAt)
 */
class NoteReply extends Entity
{
    protected $noteId;
    protected $fileId;
    protected $text;
    protected $authorUid;
    protected $createdAt;
    protected $updatedAt;

    public function __construct()
    {
        $this->addType('noteId', 'integer');
        $this->addType('fileId', 'integer');
        $this->addType('text', 'string');
        $this->addType('authorUid', 'string');
        $this->addType('createdAt', 'integer');
        $this->addType('updatedAt', 'integer');
    }
}
