<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Service\ThumbnailService;
use OCA\ThreeDViewer\Service\ThumbnailStoreResult;
use OCP\Files\IAppData;
use OCP\Files\NotFoundException;
use OCP\Files\SimpleFS\ISimpleFile;
use OCP\Files\SimpleFS\ISimpleFolder;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class ThumbnailServiceTest extends TestCase
{
    /**
     * The fake app-data tree: folder name => (sub-folder name => (file name => bytes)).
     *
     * @var array<string, array<string, array<string, string>>>
     */
    private array $tree = [];

    private ThumbnailService $service;

    protected function setUp(): void
    {
        $this->tree = [];
        $this->service = new ThumbnailService($this->appData(), $this->createMock(LoggerInterface::class));
    }

    public function testStoresAValidPng(): void
    {
        $png = $this->fixture('64x64.png');

        $this->assertSame(ThumbnailStoreResult::Stored, $this->service->store(7, '"abc"', $png));
        $this->assertTrue($this->service->has(7, '"abc"'));
        $this->assertSame($png, $this->service->get(7, '"abc"'));
    }

    public function testSecondWriteForSameVersionIsRejected(): void
    {
        $first = $this->fixture('64x64.png');
        $second = $this->fixture('64x64-other.png');

        $this->service->store(7, '"abc"', $first);

        $this->assertSame(ThumbnailStoreResult::Exists, $this->service->store(7, '"abc"', $second));
        $this->assertSame($first, $this->service->get(7, '"abc"'));
    }

    public function testDifferentVersionIsIndependent(): void
    {
        $this->service->store(7, '"abc"', $this->fixture('64x64.png'));

        $this->assertFalse($this->service->has(7, '"def"'));
        $this->assertNull($this->service->get(7, '"def"'));
    }

    public function testNothingStoredMeansNothingFound(): void
    {
        $this->assertFalse($this->service->has(7, '"abc"'));
        $this->assertNull($this->service->get(7, '"abc"'));
    }

    #[DataProvider('rejectedPayloads')]
    public function testRejectsAnythingThatIsNotAnInRangePng(string $payload): void
    {
        $this->assertSame(ThumbnailStoreResult::InvalidImage, $this->service->store(7, '"abc"', $payload));
        $this->assertFalse($this->service->has(7, '"abc"'));
    }

    /** @return array<string, array{string}> */
    public static function rejectedPayloads(): array
    {
        return [
            'a JPEG' => [self::fixture('64x64.jpg')],
            'text' => ['not an image'],
            'an empty string' => [''],
            'a PNG below 16 px' => [self::fixture('8x8.png')],
            'a PNG above 1024 px' => [self::fixture('2048x2048.png')],
        ];
    }

    public function testRejectsOversizedPayload(): void
    {
        $payload = str_repeat('a', ThumbnailService::MAX_BYTES + 1);

        $this->assertSame(ThumbnailStoreResult::InvalidImage, $this->service->store(7, '"abc"', $payload));
    }

    public function testDeleteAllRemovesEveryVersion(): void
    {
        $this->service->store(7, '"abc"', $this->fixture('64x64.png'));
        $this->service->store(7, '"def"', $this->fixture('64x64-other.png'));
        $this->service->store(8, '"abc"', $this->fixture('64x64.png'));

        $this->service->deleteAll(7);

        $this->assertFalse($this->service->has(7, '"abc"'));
        $this->assertFalse($this->service->has(7, '"def"'));
        $this->assertTrue($this->service->has(8, '"abc"'), 'another file keeps its thumbnail');
    }

    public function testDeleteAllForAFileWithNoThumbnailsIsANoOp(): void
    {
        $this->service->deleteAll(99);

        $this->assertFalse($this->service->has(99, '"abc"'));
    }

    public function testEtagIsHashedForTheFileName(): void
    {
        $etag = '"a/b"';
        $this->service->store(7, $etag, $this->fixture('64x64.png'));

        $this->assertSame([sha1($etag) . '.png'], array_keys($this->tree['thumbnails-v2']['7']));
    }

    private static function fixture(string $name): string
    {
        $bytes = file_get_contents(__DIR__ . '/../../fixtures/thumbnails/' . $name);
        self::assertIsString($bytes);

        return $bytes;
    }

    private function appData(): IAppData
    {
        $appData = $this->createMock(IAppData::class);
        $appData->method('getFolder')->willReturnCallback(function (string $name): ISimpleFolder {
            if (!isset($this->tree[$name])) {
                throw new NotFoundException($name);
            }

            return $this->folder($name, null);
        });
        $appData->method('newFolder')->willReturnCallback(function (string $name): ISimpleFolder {
            $this->tree[$name] ??= [];

            return $this->folder($name, null);
        });

        return $appData;
    }

    /** A folder mock over the shared tree; $child is null for the top level. */
    private function folder(string $top, ?string $child): ISimpleFolder
    {
        $folder = $this->createMock(ISimpleFolder::class);

        if ($child === null) {
            $folder->method('getFolder')->willReturnCallback(function (string $name) use ($top): ISimpleFolder {
                if (!isset($this->tree[$top][$name])) {
                    throw new NotFoundException($name);
                }

                return $this->folder($top, $name);
            });
            $folder->method('newFolder')->willReturnCallback(function (string $name) use ($top): ISimpleFolder {
                $this->tree[$top][$name] ??= [];

                return $this->folder($top, $name);
            });
            $folder->method('delete')->willReturnCallback(function () use ($top): void {
                unset($this->tree[$top]);
            });

            return $folder;
        }

        $folder->method('fileExists')->willReturnCallback(fn (string $name): bool => isset($this->tree[$top][$child][$name]));
        $folder->method('getFile')->willReturnCallback(function (string $name) use ($top, $child): ISimpleFile {
            if (!isset($this->tree[$top][$child][$name])) {
                throw new NotFoundException($name);
            }

            return $this->file($top, $child, $name);
        });
        $folder->method('newFile')->willReturnCallback(function (string $name, $content = null) use ($top, $child): ISimpleFile {
            $this->tree[$top][$child][$name] = (string) $content;

            return $this->file($top, $child, $name);
        });
        $folder->method('delete')->willReturnCallback(function () use ($top, $child): void {
            unset($this->tree[$top][$child]);
        });

        return $folder;
    }

    private function file(string $top, string $child, string $name): ISimpleFile
    {
        $file = $this->createMock(ISimpleFile::class);
        $file->method('getContent')->willReturnCallback(fn (): string => $this->tree[$top][$child][$name]);
        $file->method('putContent')->willReturnCallback(function ($data) use ($top, $child, $name): void {
            $this->tree[$top][$child][$name] = (string) $data;
        });

        return $file;
    }
}
