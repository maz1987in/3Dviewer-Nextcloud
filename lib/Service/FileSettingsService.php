<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCA\ThreeDViewer\Db\FileSetting;
use OCA\ThreeDViewer\Db\FileSettingMapper;
use OCA\ThreeDViewer\Service\Exception\InvalidFileSettingException;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\DB\Exception;

/**
 * The settings of a model that everyone who can open it shares: for now, the unit a file
 * that records none was drawn in. Callers check the rights (NoteAccess); this checks the
 * values.
 */
class FileSettingsService
{
    /** The units a file can be said to be in; the viewer's FILE_UNITS (utils/sourceUnits.js). */
    public const UNITS = ['mm', 'cm', 'm', 'in', 'ft', 'us-ft'];

    /**
     * Formats whose files record no unit. An FBX may record one; the viewer reads that from
     * the file and ignores a unit stored here, so it is accepted.
     */
    public const UNITLESS_FORMATS = ['stl', 'obj', 'ply', 'off', '3ds', 'fbx'];

    /** @psalm-suppress PossiblyUnusedMethod Constructed by the DI container */
    public function __construct(
        private readonly FileSettingMapper $mapper,
        private readonly ITimeFactory $time,
    ) {
    }

    public function unit(int $fileId): ?string
    {
        return $this->mapper->findByFile($fileId)?->getUnit();
    }

    /**
     * @param mixed $unit a key of UNITS, or null to go back to the format's default
     * @return ?string the unit now stored
     * @throws InvalidFileSettingException for a value that is not a unit, or a format that records its own
     * @throws Exception for a database failure other than a concurrent first write
     */
    public function setUnit(int $fileId, string $fileName, mixed $unit, string $uid): ?string
    {
        if ($unit === null) {
            $this->mapper->deleteByFile($fileId);

            return null;
        }
        if (!is_string($unit) || !in_array($unit, self::UNITS, true)) {
            throw new InvalidFileSettingException('Unknown unit');
        }
        $extension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        if (!in_array($extension, self::UNITLESS_FORMATS, true)) {
            throw new InvalidFileSettingException('This file records its own unit');
        }

        $existing = $this->mapper->findByFile($fileId);
        if ($existing !== null) {
            return $this->write($existing, $unit, $uid, false);
        }

        $setting = new FileSetting();
        $setting->setFileId($fileId);

        try {
            return $this->write($setting, $unit, $uid, true);
        } catch (Exception $e) {
            // Another editor made the row between the read and the insert: theirs is
            // updated, so the last write wins rather than the second failing
            $raced = $e->getReason() === Exception::REASON_UNIQUE_CONSTRAINT_VIOLATION ? $this->mapper->findByFile($fileId) : null;
            if ($raced === null) {
                throw $e;
            }

            return $this->write($raced, $unit, $uid, false);
        }
    }

    private function write(FileSetting $setting, string $unit, string $uid, bool $new): ?string
    {
        $setting->setUnit($unit);
        $setting->setUpdatedBy($uid);
        $setting->setUpdatedAt($this->time->getTime());

        return ($new ? $this->mapper->insert($setting) : $this->mapper->update($setting))->getUnit();
    }
}
