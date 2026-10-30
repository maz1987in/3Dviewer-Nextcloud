<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCA\ThreeDViewer\Db\FileSetting;
use OCA\ThreeDViewer\Db\FileSettingMapper;
use OCA\ThreeDViewer\Service\Exception\InvalidFileSettingException;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\DB\Exception;

/**
 * The settings of a model that everyone who can open it shares: the unit a file that
 * records none was drawn in, and which way is up for a scan. Callers check the rights
 * (NoteAccess); this checks the values.
 */
class FileSettingsService
{
    /** The units a file can be said to be in; the viewer's FILE_UNITS (utils/sourceUnits.js). */
    public const UNITS = ['mm', 'cm', 'm', 'in', 'ft', 'us-ft'];

    /**
     * Formats whose files record no unit. An FBX may record one, and so may a LAS or LAZ
     * whose coordinate system names it; the viewer reads that from the file and ignores a
     * unit stored here, so they are accepted. E57 always stores metres.
     */
    public const UNITLESS_FORMATS = ['stl', 'obj', 'ply', 'off', '3ds', 'fbx', 'las', 'laz', 'pcd', 'xyz'];

    /** Which way is up; the viewer's UPS (pointclouds/upAxis.js). */
    public const UPS = ['+y', '-y', '+z', '-z'];

    /** Formats that can be turned: scans, which come out of scanners and apps every way up. */
    public const UP_FORMATS = ['las', 'laz', 'e57', 'pcd', 'xyz', 'ply'];

    /** @psalm-suppress PossiblyUnusedMethod Constructed by the DI container */
    public function __construct(
        private readonly FileSettingMapper $mapper,
        private readonly ITimeFactory $time,
    ) {
    }

    /** @return array{unit: ?string, up: ?string} */
    public function settings(int $fileId): array
    {
        $setting = $this->mapper->findByFile($fileId);

        return ['unit' => $setting?->getUnit(), 'up' => $setting?->getUp()];
    }

    /**
     * Change some of a file's settings at once: every value is checked before anything is
     * written, so one bad value saves none. A setting set to null goes back to its format's
     * default; the row goes once nothing is left in it.
     *
     * @param array<array-key, mixed> $changes `unit` (a key of UNITS) and/or `up` (one of
     *                                         UPS), each possibly null; other keys are ignored
     * @return array{unit: ?string, up: ?string} what is now stored
     * @throws InvalidFileSettingException for a value that is not a unit or a direction, or a
     *                                     format that records its own unit or can't be turned
     * @throws Exception for a database failure other than a concurrent first write
     */
    public function set(int $fileId, string $fileName, array $changes, string $uid): array
    {
        $extension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        $setsUnit = array_key_exists('unit', $changes);
        $setsUp = array_key_exists('up', $changes);
        $unit = $setsUnit ? self::checkedUnit($changes['unit'], $extension) : null;
        $up = $setsUp ? self::checkedUp($changes['up'], $extension) : null;

        $existing = $this->mapper->findByFile($fileId);
        $newUnit = $setsUnit ? $unit : $existing?->getUnit();
        $newUp = $setsUp ? $up : $existing?->getUp();
        if ($newUnit === null && $newUp === null) {
            if ($existing !== null) {
                $this->mapper->deleteByFile($fileId);
            }

            return ['unit' => null, 'up' => null];
        }
        if ($existing !== null) {
            return $this->write($existing, $newUnit, $newUp, $uid, false);
        }

        $setting = new FileSetting();
        $setting->setFileId($fileId);

        try {
            return $this->write($setting, $newUnit, $newUp, $uid, true);
        } catch (Exception $e) {
            // Another editor made the row between the read and the insert: theirs is
            // updated, so the last write wins rather than the second failing. Only what
            // this request changes overwrites theirs.
            $raced = $e->getReason() === Exception::REASON_UNIQUE_CONSTRAINT_VIOLATION ? $this->mapper->findByFile($fileId) : null;
            if ($raced === null) {
                throw $e;
            }

            return $this->write($raced, $setsUnit ? $unit : $raced->getUnit(), $setsUp ? $up : $raced->getUp(), $uid, false);
        }
    }

    /** @throws InvalidFileSettingException */
    private static function checkedUnit(mixed $unit, string $extension): ?string
    {
        if ($unit === null) {
            return null;
        }
        if (!is_string($unit) || !in_array($unit, self::UNITS, true)) {
            throw new InvalidFileSettingException('Unknown unit');
        }
        if (!in_array($extension, self::UNITLESS_FORMATS, true)) {
            throw new InvalidFileSettingException('This file records its own unit');
        }

        return $unit;
    }

    /** @throws InvalidFileSettingException */
    private static function checkedUp(mixed $up, string $extension): ?string
    {
        if ($up === null) {
            return null;
        }
        if (!is_string($up) || !in_array($up, self::UPS, true)) {
            throw new InvalidFileSettingException('Unknown direction');
        }
        if (!in_array($extension, self::UP_FORMATS, true)) {
            throw new InvalidFileSettingException('This file can\'t be turned');
        }

        return $up;
    }

    /** @return array{unit: ?string, up: ?string} */
    private function write(FileSetting $setting, ?string $unit, ?string $up, string $uid, bool $new): array
    {
        $setting->setUnit($unit);
        $setting->setUp($up);
        $setting->setUpdatedBy($uid);
        $setting->setUpdatedAt($this->time->getTime());
        $saved = $new ? $this->mapper->insert($setting) : $this->mapper->update($setting);

        return ['unit' => $saved->getUnit(), 'up' => $saved->getUp()];
    }
}
