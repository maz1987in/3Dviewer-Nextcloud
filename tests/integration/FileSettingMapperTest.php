<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Integration;

use OCA\ThreeDViewer\Db\FileSetting;
use OCA\ThreeDViewer\Db\FileSettingMapper;
use OCP\DB\Exception;
use OCP\Files\IRootFolder;
use OCP\IUserManager;
use OCP\Server;
use PHPUnit\Framework\TestCase;

/**
 * FileSettingMapper against the real database — SQLite, MySQL and Postgres in CI.
 */
class FileSettingMapperTest extends TestCase
{
    private const PASSWORD = 'integration-suite-password-Aa1!';

    /** A file id no filecache row will ever have. */
    private const MISSING_FILE_ID = 2_000_000_001;

    private FileSettingMapper $mapper;

    private string $uid;

    private int $fileId;

    protected function setUp(): void
    {
        $this->mapper = Server::get(FileSettingMapper::class);
        $this->uid = 'tdv-it-' . bin2hex(random_bytes(6));
        Server::get(IUserManager::class)->createUser($this->uid, self::PASSWORD);
        $home = Server::get(IRootFolder::class)->getUserFolder($this->uid);
        $this->fileId = $home->newFile('model.stl', 'solid x')->getId();
    }

    protected function tearDown(): void
    {
        $this->mapper->deleteByFile($this->fileId);
        $this->mapper->deleteByFile(self::MISSING_FILE_ID);
        Server::get(IUserManager::class)->get($this->uid)?->delete();
    }

    public function testFindByFileReturnsNullWhenUnset(): void
    {
        $this->assertNull($this->mapper->findByFile($this->fileId));
    }

    public function testFindsTheSettingOfOneFile(): void
    {
        $this->insert($this->fileId, 'in');
        $this->insert(self::MISSING_FILE_ID, 'cm');

        $this->assertSame('in', $this->mapper->findByFile($this->fileId)?->getUnit());
    }

    public function testTheUniqueIndexRefusesASecondRowForAFile(): void
    {
        $this->insert($this->fileId, 'in');

        try {
            $this->insert($this->fileId, 'cm');
            $this->fail('A second row for the same file was accepted');
        } catch (Exception $e) {
            $this->assertSame(Exception::REASON_UNIQUE_CONSTRAINT_VIOLATION, $e->getReason());
        }
    }

    public function testDeleteOrphansKeepsSettingsOfExistingFiles(): void
    {
        $this->insert($this->fileId, 'in');
        $this->insert(self::MISSING_FILE_ID, 'cm');

        $deleted = $this->mapper->deleteOrphans();

        $this->assertGreaterThanOrEqual(1, $deleted);
        $this->assertNull($this->mapper->findByFile(self::MISSING_FILE_ID));
        $this->assertSame('in', $this->mapper->findByFile($this->fileId)?->getUnit());
    }

    private function insert(int $fileId, string $unit): FileSetting
    {
        $setting = new FileSetting();
        $setting->setFileId($fileId);
        $setting->setUnit($unit);
        $setting->setUpdatedBy($this->uid);
        $setting->setUpdatedAt(time());

        return $this->mapper->insert($setting);
    }
}
