<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Db;

use OCP\AppFramework\Db\Entity;

/**
 * @method int getFileId()
 * @method void setFileId(int $fileId)
 * @method string getUserId()
 * @method void setUserId(string $userId)
 * @method string getName()
 * @method void setName(string $name)
 * @method string getPath()
 * @method void setPath(string $path)
 * @method string getFolderPath()
 * @method void setFolderPath(string $folderPath)
 * @method string getExtension()
 * @method void setExtension(string $extension)
 * @method int getMtime()
 * @method void setMtime(int $mtime)
 * @method int getSize()
 * @method void setSize(int $size)
 * @method int getYear()
 * @method void setYear(int $year)
 * @method int getMonth()
 * @method void setMonth(int $month)
 * @method int getIndexedAt()
 * @method void setIndexedAt(int $indexedAt)
 * @method string getFolderPathHash()
 * @method void setFolderPathHash(string $folderPathHash)
 */
class FileIndex extends Entity implements \JsonSerializable
{
    protected $fileId;
    protected $userId;
    protected $name;
    protected $path;
    protected $folderPath;
    protected $folderPathHash;
    protected $extension;
    protected $mtime;
    protected $size;
    protected $year;
    protected $month;
    protected $indexedAt;

    public function __construct()
    {
        $this->addType('fileId', 'integer');
        $this->addType('userId', 'string');
        $this->addType('name', 'string');
        $this->addType('path', 'string');
        $this->addType('folderPath', 'string');
        $this->addType('folderPathHash', 'string');
        $this->addType('extension', 'string');
        $this->addType('mtime', 'integer');
        $this->addType('size', 'integer');
        $this->addType('year', 'integer');
        $this->addType('month', 'integer');
        $this->addType('indexedAt', 'integer');
    }

    #[\ReturnTypeWillChange]
    public function jsonSerialize()
    {
        return [
            'id' => $this->id,
            'file_id' => $this->fileId,
            'user_id' => $this->userId,
            'name' => $this->name,
            'path' => $this->path,
            'folder_path' => $this->folderPath,
            'folder_path_hash' => $this->folderPathHash,
            'extension' => $this->extension,
            'mtime' => $this->mtime,
            'size' => $this->size,
            'year' => $this->year,
            'month' => $this->month,
            'indexed_at' => $this->indexedAt,
        ];
    }
}
