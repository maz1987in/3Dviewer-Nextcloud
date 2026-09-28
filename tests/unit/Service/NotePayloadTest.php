<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Service\Exception\InvalidNoteException;
use OCA\ThreeDViewer\Service\NotePayload;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class NotePayloadTest extends TestCase
{
    private const POINT = ['x' => 1, 'y' => 2.5, 'z' => -3];

    public function testNormalizesAnAnnotation(): void
    {
        $out = NotePayload::validate('annotation', ['space' => 'model', 'point' => self::POINT, 'text' => 'Bracket']);

        $this->assertSame(['space' => 'model', 'point' => ['x' => 1.0, 'y' => 2.5, 'z' => -3.0], 'text' => 'Bracket'], $out);
    }

    public function testNormalizesAMeasurement(): void
    {
        $out = NotePayload::validate('measurement', ['space' => 'model', 'points' => [self::POINT, self::POINT]]);

        $this->assertCount(2, $out['points']);
        $this->assertSame(-3.0, $out['points'][1]['z']);
    }

    public function testSceneSpaceIsOnlyAcceptedWhenAllowed(): void
    {
        $payload = ['space' => 'scene', 'point' => self::POINT, 'text' => ''];

        $this->assertSame('scene', NotePayload::validate('annotation', $payload, true)['space']);

        $this->expectException(InvalidNoteException::class);
        NotePayload::validate('annotation', $payload);
    }

    /** @return array<string, array{0: string, 1: mixed}> */
    public static function invalidProvider(): array
    {
        $point = self::POINT;

        return [
            'unknown type' => ['comment', ['space' => 'model']],
            'payload not an object' => ['annotation', 'text'],
            'payload is a list' => ['annotation', [1, 2, 3]],
            'missing space' => ['annotation', ['point' => $point, 'text' => '']],
            'unknown key' => ['annotation', ['space' => 'model', 'point' => $point, 'text' => '', 'color' => 'red']],
            'text not a string' => ['annotation', ['space' => 'model', 'point' => $point, 'text' => 5]],
            'text too long' => ['annotation', ['space' => 'model', 'point' => $point, 'text' => str_repeat('a', 2001)]],
            'coordinate is a string' => ['annotation', ['space' => 'model', 'point' => ['x' => '1', 'y' => 0, 'z' => 0], 'text' => '']],
            'coordinate infinite' => ['annotation', ['space' => 'model', 'point' => ['x' => INF, 'y' => 0, 'z' => 0], 'text' => '']],
            'coordinate NaN' => ['annotation', ['space' => 'model', 'point' => ['x' => NAN, 'y' => 0, 'z' => 0], 'text' => '']],
            'point extra key' => ['annotation', ['space' => 'model', 'point' => $point + ['w' => 1], 'text' => '']],
            'measurement one point' => ['measurement', ['space' => 'model', 'points' => [$point]]],
            'measurement three points' => ['measurement', ['space' => 'model', 'points' => [$point, $point, $point]]],
            'measurement with text' => ['measurement', ['space' => 'model', 'points' => [$point, $point], 'text' => '']],
        ];
    }

    #[DataProvider('invalidProvider')]
    public function testRejects(string $type, mixed $payload): void
    {
        $this->expectException(InvalidNoteException::class);
        NotePayload::validate($type, $payload);
    }

    /** Review focus: a full-length note in a four-byte script must not trip the byte cap. */
    public function testMaxLengthEmojiTextFitsTheByteCap(): void
    {
        $text = str_repeat('🔩', NotePayload::MAX_TEXT_CHARS);

        $out = NotePayload::validate('annotation', ['space' => 'model', 'point' => self::POINT, 'text' => $text]);

        $this->assertSame($text, $out['text']);
    }

    /** Quotes and backslashes double when escaped; the cap must hold for them too. */
    public function testMaxLengthEscapedTextFitsTheByteCap(): void
    {
        $text = str_repeat('"\\', NotePayload::MAX_TEXT_CHARS / 2);

        $out = NotePayload::validate('annotation', ['space' => 'model', 'point' => self::POINT, 'text' => $text]);

        $this->assertSame($text, $out['text']);
    }

    public function testEncodeRoundTrips(): void
    {
        $normalized = NotePayload::validate('annotation', ['space' => 'model', 'point' => self::POINT, 'text' => 'ü']);

        $this->assertSame($normalized, json_decode(NotePayload::encode($normalized), true));
    }
}
