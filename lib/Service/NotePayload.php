<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCA\ThreeDViewer\Service\Exception\InvalidNoteException;

/**
 * The shape of a stored note, checked before anything reaches the database.
 *
 * Unknown keys are refused rather than ignored: a field that is silently dropped today is
 * a field some client starts depending on tomorrow.
 */
final class NotePayload
{
    public const TYPES = ['annotation', 'measurement'];

    public const MAX_TEXT_CHARS = 2000;

    /**
     * Set above what MAX_TEXT_CHARS can need — 2,000 four-byte characters, or 2,000
     * characters that each escape to two — so the byte cap never rejects a note the
     * character cap allows.
     */
    public const MAX_BYTES = 10240;

    private const ENCODE_FLAGS = JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION;

    /**
     * @param bool $allowScene only the legacy migration writes scene-space points
     * @return array<string, mixed> the normalized payload
     * @throws InvalidNoteException
     */
    public static function validate(string $type, mixed $payload, bool $allowScene = false): array
    {
        if (!in_array($type, self::TYPES, true)) {
            throw new InvalidNoteException('Unknown note type');
        }
        if (!is_array($payload) || ($payload !== [] && array_is_list($payload))) {
            throw new InvalidNoteException('Payload must be an object');
        }

        $space = $payload['space'] ?? null;
        if (!in_array($space, $allowScene ? ['model', 'scene'] : ['model'], true)) {
            throw new InvalidNoteException('Invalid coordinate space');
        }

        if ($type === 'annotation') {
            self::onlyKeys($payload, ['space', 'point', 'text']);
            $text = $payload['text'] ?? null;
            if (!is_string($text)) {
                throw new InvalidNoteException('Annotation text must be a string');
            }
            if (mb_strlen($text) > self::MAX_TEXT_CHARS) {
                throw new InvalidNoteException('Annotation text is too long');
            }
            $normalized = ['space' => $space, 'point' => self::point($payload['point'] ?? null), 'text' => $text];
        } else {
            self::onlyKeys($payload, ['space', 'points']);
            $points = $payload['points'] ?? null;
            if (!is_array($points) || !array_is_list($points) || count($points) !== 2) {
                throw new InvalidNoteException('A measurement needs exactly two points');
            }
            $normalized = ['space' => $space, 'points' => [self::point($points[0]), self::point($points[1])]];
        }

        if (strlen(self::encode($normalized)) > self::MAX_BYTES) {
            throw new InvalidNoteException('Note is too large');
        }

        return $normalized;
    }

    /**
     * @param array<string, mixed> $normalized output of validate()
     */
    public static function encode(array $normalized): string
    {
        return json_encode($normalized, self::ENCODE_FLAGS);
    }

    /**
     * @param array<array-key, mixed> $data
     * @param list<string> $allowed
     */
    private static function onlyKeys(array $data, array $allowed): void
    {
        $extra = array_diff(array_map('strval', array_keys($data)), $allowed);
        if ($extra !== []) {
            throw new InvalidNoteException('Unknown field: ' . implode(', ', $extra));
        }
    }

    /**
     * @return array{x: float, y: float, z: float}
     */
    private static function point(mixed $point): array
    {
        if (!is_array($point)) {
            throw new InvalidNoteException('Point must be an object');
        }
        self::onlyKeys($point, ['x', 'y', 'z']);

        $out = [];
        foreach (['x', 'y', 'z'] as $axis) {
            $value = $point[$axis] ?? null;
            if (!is_int($value) && !is_float($value)) {
                throw new InvalidNoteException("Coordinate $axis must be a number");
            }
            if (!is_finite((float) $value)) {
                throw new InvalidNoteException("Coordinate $axis must be finite");
            }
            $out[$axis] = (float) $value;
        }

        return $out;
    }
}
