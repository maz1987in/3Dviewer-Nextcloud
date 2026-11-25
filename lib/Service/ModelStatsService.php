<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCA\ThreeDViewer\Db\ModelStat;
use OCA\ThreeDViewer\Db\ModelStatMapper;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\DB\Exception;
use Psr\Log\LoggerInterface;

/**
 * Stores what the browser measured of one version of a model: its size in the file's own
 * unit, its triangles, vertices, parts, materials and textures, and the like. The Files
 * sidebar's "3D" tab reads it back, so a model that was measured once shows its numbers at
 * once.
 *
 * The numbers are the browser's, and shown to everyone who can open the file, so
 * `normalize()` is the whole gate on what may be stored: every field is named, typed and
 * bounded, anything else rejects the lot, and what is stored is the rebuilt array, never
 * the request. Callers check the rights (NoteAccess) and that the version is the file's
 * current one. Rows are keyed by file id and name the ETag they were measured from, so the
 * numbers of an earlier version are never read back for a later one, and the first
 * measurement of a version is kept.
 */
class ModelStatsService
{
    /** The JSON of one measurement is well under this; the cap bounds what a client can make the table hold. */
    public const MAX_BYTES = 2048;

    public const VERSION = 1;

    /** What a model is made of, which decides which of its counts are the ones to show. */
    public const KINDS = ['mesh', 'points', 'splats', 'toolpath'];

    /** Which way is up for a scan or splat; FileSettingsService::UPS. */
    private const UPS = FileSettingsService::UPS;

    /** No real length, count or area is this large; a crafted one is refused rather than shown. */
    private const MAX_COUNT = 1_000_000_000_000;
    private const MAX_LENGTH = 1.0e12;
    private const MAX_AREA = 1.0e24;
    private const MAX_VOLUME = 1.0e36;
    private const MAX_SECONDS = 3_153_600_000;
    private const MIN_UNIT_MM = 1.0e-6;
    private const MAX_UNIT_MM = 1.0e9;

    private const COUNT_FIELDS = ['triangles', 'vertices', 'points', 'splats', 'parts', 'materials', 'textures'];

    /** @psalm-suppress PossiblyUnusedMethod Constructed by the DI container */
    public function __construct(
        private readonly ModelStatMapper $mapper,
        private readonly ITimeFactory $time,
        private readonly LoggerInterface $logger,
    ) {
    }

    /**
     * Check a measurement and rebuild it from the fields this service knows.
     *
     * @param mixed $raw the decoded request field
     * @return array<string, mixed>|null the measurement as it is stored, or null when
     *                                   anything in it is missing, mistyped, unknown or out of range
     */
    public static function normalize(mixed $raw): ?array
    {
        if (!is_array($raw) || array_is_list($raw)) {
            return null;
        }
        $allowed = array_merge(['v', 'kind', 'size', 'unit', 'up', 'area', 'volume', 'watertight', 'layers', 'printSeconds'], self::COUNT_FIELDS);
        if (array_diff(array_keys($raw), $allowed) !== []) {
            return null;
        }
        if (($raw['v'] ?? null) !== self::VERSION) {
            return null;
        }
        $kind = $raw['kind'] ?? null;
        if (!is_string($kind) || !in_array($kind, self::KINDS, true)) {
            return null;
        }

        $size = self::size($raw['size'] ?? null);
        $unit = self::unit($raw['unit'] ?? null);
        $up = $raw['up'] ?? null;
        if ($size === null || $unit === null || ($up !== null && (!is_string($up) || !in_array($up, self::UPS, true)))) {
            return null;
        }

        $stats = ['v' => self::VERSION, 'kind' => $kind, 'size' => $size, 'unit' => $unit, 'up' => $up];
        foreach (self::COUNT_FIELDS as $field) {
            $count = self::count($raw[$field] ?? 0, self::MAX_COUNT);
            if ($count === null) {
                return null;
            }
            $stats[$field] = $count;
        }

        $area = self::optionalNumber($raw['area'] ?? null, self::MAX_AREA);
        $volume = self::optionalNumber($raw['volume'] ?? null, self::MAX_VOLUME);
        $layers = self::optionalCount($raw['layers'] ?? null, 10_000_000);
        $seconds = self::optionalCount($raw['printSeconds'] ?? null, self::MAX_SECONDS);
        if ($area === false || $volume === false || $layers === false || $seconds === false) {
            return null;
        }
        $watertight = $raw['watertight'] ?? null;
        if ($watertight !== null && !is_bool($watertight)) {
            return null;
        }
        $stats['area'] = $area;
        $stats['volume'] = $volume;
        $stats['watertight'] = $watertight;
        $stats['layers'] = $layers;
        $stats['printSeconds'] = $seconds;

        return $stats;
    }

    /**
     * Store the measurement of one version of a file; the first one for a version is kept.
     *
     * @param string $etag the file's current ETag, which the caller has compared with the request's
     * @param mixed $raw the decoded measurement
     * @throws Exception for a database failure other than a concurrent first write
     */
    public function store(int $fileId, string $etag, mixed $raw, string $uid): ModelStatsStoreResult
    {
        $stats = self::normalize($raw);
        $json = $stats === null ? '' : json_encode($stats, JSON_THROW_ON_ERROR);
        if ($stats === null || strlen($json) > self::MAX_BYTES || $etag === '' || strlen($etag) > 128) {
            $this->logger->info('ModelStatsService: Rejected a measurement', ['fileId' => $fileId]);

            return ModelStatsStoreResult::Invalid;
        }

        $existing = $this->mapper->findByFile($fileId);
        if ($existing !== null && hash_equals($existing->getEtag(), $etag)) {
            return ModelStatsStoreResult::Exists;
        }
        if ($existing !== null) {
            // The numbers of an earlier version: this version's replace them
            return $this->write($existing, $etag, $json, $uid, false);
        }

        $row = new ModelStat();
        $row->setFileId($fileId);

        try {
            return $this->write($row, $etag, $json, $uid, true);
        } catch (Exception $e) {
            // Another request wrote the row between the read and the insert. If it was
            // this version, its numbers stand; if it was an earlier one, this replaces it.
            $raced = $e->getReason() === Exception::REASON_UNIQUE_CONSTRAINT_VIOLATION ? $this->mapper->findByFile($fileId) : null;
            if ($raced === null) {
                throw $e;
            }
            if (hash_equals($raced->getEtag(), $etag)) {
                return ModelStatsStoreResult::Exists;
            }

            return $this->write($raced, $etag, $json, $uid, false);
        }
    }

    /**
     * The measurement of a version of a file, never that of another version.
     *
     * @return array<string, mixed>|null null when this version was not measured, or what is stored is unreadable
     */
    public function get(int $fileId, string $etag): ?array
    {
        $row = $this->mapper->findByFile($fileId);
        if ($row === null || $etag === '' || !hash_equals($row->getEtag(), $etag)) {
            return null;
        }

        try {
            // Read back through the same gate: a row written by an older release is not trusted more
            return self::normalize(json_decode($row->getStats(), true, 8, JSON_THROW_ON_ERROR));
        } catch (\JsonException) {
            return null;
        }
    }

    /**
     * Which of the given files were measured at the version in `$etags`.
     *
     * @param array<int, string> $etags current ETag by file id
     * @return list<int> the file ids that have numbers for that very version
     */
    public function measured(array $etags): array
    {
        if ($etags === []) {
            return [];
        }
        $stored = $this->mapper->findEtags(array_keys($etags));

        return array_values(array_filter(
            array_keys($etags),
            static fn (int $id): bool => isset($stored[$id]) && hash_equals($stored[$id], $etags[$id]),
        ));
    }

    public function delete(int $fileId): void
    {
        $this->mapper->deleteByFile($fileId);
    }

    private function write(ModelStat $row, string $etag, string $json, string $uid, bool $new): ModelStatsStoreResult
    {
        $row->setEtag($etag);
        $row->setStats($json);
        $row->setCreatedBy($uid);
        $row->setCreatedAt($this->time->getTime());
        if ($new) {
            $this->mapper->insert($row);
        } else {
            $this->mapper->update($row);
        }

        return ModelStatsStoreResult::Stored;
    }

    /**
     * @return list<float>|null three finite, non-negative lengths
     */
    private static function size(mixed $size): ?array
    {
        if (!is_array($size) || !array_is_list($size) || count($size) !== 3) {
            return null;
        }
        $out = [];
        foreach ($size as $length) {
            if ((!is_int($length) && !is_float($length)) || !is_finite((float) $length) || $length < 0 || $length > self::MAX_LENGTH) {
                return null;
            }
            $out[] = (float) $length;
        }

        return $out;
    }

    /**
     * @return array{mm: float, changeable: bool}|null
     */
    private static function unit(mixed $unit): ?array
    {
        if (!is_array($unit) || array_diff(array_keys($unit), ['mm', 'changeable']) !== []) {
            return null;
        }
        $mm = $unit['mm'] ?? null;
        $changeable = $unit['changeable'] ?? null;
        if ((!is_int($mm) && !is_float($mm)) || !is_finite((float) $mm) || $mm < self::MIN_UNIT_MM || $mm > self::MAX_UNIT_MM || !is_bool($changeable)) {
            return null;
        }

        return ['mm' => (float) $mm, 'changeable' => $changeable];
    }

    /**
     * @return int|null a whole number from zero to the cap, or null
     */
    private static function count(mixed $value, int $max): ?int
    {
        if (is_float($value) && is_finite($value) && floor($value) === $value && abs($value) <= $max) {
            $value = (int) $value;
        }
        if (!is_int($value) || $value < 0 || $value > $max) {
            return null;
        }

        return $value;
    }

    /**
     * @return int|false|null the count, null when absent, false when present but not a count
     */
    private static function optionalCount(mixed $value, int $max): int|false|null
    {
        if ($value === null) {
            return null;
        }

        return self::count($value, $max) ?? false;
    }

    /**
     * @return float|false|null the number, null when absent, false when present but not a finite non-negative number
     */
    private static function optionalNumber(mixed $value, float $max): float|false|null
    {
        if ($value === null) {
            return null;
        }
        if ((!is_int($value) && !is_float($value)) || !is_finite((float) $value) || $value < 0 || $value > $max) {
            return false;
        }

        return (float) $value;
    }
}
