<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Preview;

use OCA\ThreeDViewer\Constants\SupportedFormats;
use OCA\ThreeDViewer\Preview\ModelPreviewProvider;
use OCA\ThreeDViewer\Service\ThumbnailService;
use OCP\Files\File;
use OCP\Files\FileInfo;
use OCP\IImage;
use OCP\IUserSession;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * Nextcloud caches a provider's preview per file for every user, so the provider has to
 * serve any reader: another user, cron, or a public-link visitor with no session at all.
 * Thumbnails are stored per file version (keyed by ETag), which also means a stale
 * thumbnail can never be offered for a file that has since changed.
 */
class ModelPreviewProviderTest extends TestCase
{
    /** @var ThumbnailService&MockObject */
    private ThumbnailService $thumbnails;

    /** @var LoggerInterface&MockObject */
    private LoggerInterface $logger;

    protected function setUp(): void
    {
        $this->thumbnails = $this->createMock(ThumbnailService::class);
        $this->logger = $this->createMock(LoggerInterface::class);
    }

    private function provider(?IImage $image = null): RecordingProvider
    {
        $provider = new RecordingProvider($this->thumbnails, $this->logger);
        $provider->image = $image;

        return $provider;
    }

    /** @return IImage&MockObject */
    private function image(int $width = 64, int $height = 64): IImage
    {
        $image = $this->createMock(IImage::class);
        $image->method('width')->willReturn($width);
        $image->method('height')->willReturn($height);

        return $image;
    }

    /** @return FileInfo&MockObject */
    private function fileInfo(string $name, ?int $id, ?string $etag): FileInfo
    {
        $info = $this->createMock(FileInfo::class);
        $info->method('getName')->willReturn($name);
        $info->method('getId')->willReturn($id);
        $info->method('getEtag')->willReturn($etag);

        return $info;
    }

    /** @return File&MockObject */
    private function file(string $name, ?int $id, ?string $etag): File
    {
        $file = $this->createMock(File::class);
        $file->method('getName')->willReturn($name);
        $file->method('getId')->willReturn($id);
        $file->method('getEtag')->willReturn($etag);

        return $file;
    }

    /** Make the thumbnail store answer for exactly one (file, version) pair. */
    private function storeHolds(int $fileId, string $etag, string $bytes = 'PNGBYTES'): void
    {
        $this->thumbnails->method('has')
            ->willReturnCallback(fn (int $id, string $e): bool => $id === $fileId && $e === $etag);
        $this->thumbnails->method('get')
            ->willReturnCallback(fn (int $id, string $e): ?string => $id === $fileId && $e === $etag ? $bytes : null);
    }

    public function testAvailableOnlyForCurrentVersion(): void
    {
        $this->storeHolds(7, '"e1"');
        $provider = $this->provider();

        $this->assertFalse($provider->isAvailable($this->fileInfo('part.stl', 7, '"e2"')));
        $this->assertTrue($provider->isAvailable($this->fileInfo('part.stl', 7, '"e1"')));
    }

    public function testAvailableWithoutASession(): void
    {
        foreach ((new \ReflectionClass(ModelPreviewProvider::class))->getConstructor()->getParameters() as $param) {
            $type = $param->getType();
            $this->assertNotSame(
                IUserSession::class,
                $type instanceof \ReflectionNamedType ? $type->getName() : null,
                'The provider must not depend on a logged-in user'
            );
        }

        $this->storeHolds(7, '"e1"');
        $this->assertTrue($this->provider()->isAvailable($this->fileInfo('part.stl', 7, '"e1"')));
    }

    /** @return array<string, array{string}> */
    public static function nonModelMimeFormats(): array
    {
        return [
            'ifc' => ['step.ifc'],
            'fcstd' => ['part.fcstd'],
            'gcode' => ['print.gcode'],
        ];
    }

    #[DataProvider('nonModelMimeFormats')]
    public function testCoversNonModelMimeFormats(string $name): void
    {
        $this->storeHolds(9, '"v"');

        $this->assertTrue($this->provider()->isAvailable($this->fileInfo($name, 9, '"v"')));
    }

    public function testEveryThumbnailExtensionIsAvailable(): void
    {
        $this->thumbnails->method('has')->willReturn(true);
        $provider = $this->provider();

        foreach (SupportedFormats::getThumbnailExtensions() as $ext) {
            $this->assertTrue($provider->isAvailable($this->fileInfo("a.$ext", 1, '"v"')), $ext);
        }
    }

    public function testMimeTypeIsTheSupportedFormatsRegex(): void
    {
        $this->assertSame(SupportedFormats::getPreviewMimeRegex(), $this->provider()->getMimeType());
    }

    public function testNotAvailableForTextureOrUnrelatedFiles(): void
    {
        $this->thumbnails->method('has')->willReturn(true);
        $provider = $this->provider();

        $this->assertFalse($provider->isAvailable($this->fileInfo('photo.png', 1, '"v"')));
        $this->assertFalse($provider->isAvailable($this->fileInfo('notes.txt', 1, '"v"')));
    }

    public function testNotAvailableWithoutFileIdOrEtag(): void
    {
        $this->thumbnails->expects($this->never())->method('has');
        $provider = $this->provider();

        $this->assertFalse($provider->isAvailable($this->fileInfo('a.stl', null, '"v"')));
        $this->assertFalse($provider->isAvailable($this->fileInfo('a.stl', 1, null)));
        $this->assertFalse($provider->isAvailable($this->fileInfo('a.stl', 1, '')));
    }

    public function testStorageFailureMeansNoThumbnailNotAnError(): void
    {
        $this->thumbnails->method('has')->willThrowException(new \RuntimeException('app data unreadable'));
        $this->logger->expects($this->once())->method('warning');

        $this->assertFalse($this->provider()->isAvailable($this->fileInfo('a.stl', 1, '"v"')));
    }

    public function testGetThumbnailReturnsNullWithoutStoredImage(): void
    {
        $this->storeHolds(7, '"e1"');
        $provider = $this->provider();

        $this->assertNull($provider->getThumbnail($this->file('a.stl', 7, '"e2"'), 256, 256));
        $this->assertSame([], $provider->received);
    }

    public function testGetThumbnailUsesStoredBytes(): void
    {
        $this->storeHolds(7, '"e1"', 'THE-PNG');
        $stored = $this->image();
        $provider = $this->provider($stored);

        $image = $provider->getThumbnail($this->file('a.stl', 7, '"e1"'), 256, 256);

        $this->assertSame($stored, $image);
        $this->assertSame(['THE-PNG'], $provider->received);
    }

    public function testGetThumbnailServesNonModelMimeFormats(): void
    {
        $this->storeHolds(7, '"e1"');
        $provider = $this->provider($this->image());

        $this->assertNotNull($provider->getThumbnail($this->file('plan.ifc', 7, '"e1"'), 256, 256));
    }

    public function testGetThumbnailResizesOnlyWhenLargerThanRequested(): void
    {
        $this->storeHolds(7, '"e1"');

        $big = $this->image(512, 512);
        $big->expects($this->once())->method('resize')->with(256);
        $provider = $this->provider($big);
        $this->assertSame($big, $provider->getThumbnail($this->file('a.stl', 7, '"e1"'), 256, 256));

        $small = $this->image(128, 128);
        $small->expects($this->never())->method('resize');
        $provider = $this->provider($small);
        $this->assertSame($small, $provider->getThumbnail($this->file('a.stl', 7, '"e1"'), 256, 256));
    }

    public function testGetThumbnailIsNullWhenBytesAreNotAnImage(): void
    {
        $this->storeHolds(7, '"e1"');

        $this->assertNull($this->provider(null)->getThumbnail($this->file('a.stl', 7, '"e1"'), 256, 256));
    }

    public function testGetThumbnailSwallowsStorageFailure(): void
    {
        $this->thumbnails->method('get')->willThrowException(new \RuntimeException('app data unreadable'));
        $this->logger->expects($this->once())->method('warning');

        $this->assertNull($this->provider()->getThumbnail($this->file('a.stl', 7, '"e1"'), 256, 256));
    }

    public function testGetThumbnailWithoutFileIdOrEtagIsNull(): void
    {
        $this->thumbnails->expects($this->never())->method('get');
        $provider = $this->provider();

        $this->assertNull($provider->getThumbnail($this->file('a.stl', null, '"v"'), 256, 256));
        $this->assertNull($provider->getThumbnail($this->file('a.stl', 7, null), 256, 256));
    }
}

/** Replaces the `\OCP\Image` seam, which cannot be constructed outside a Nextcloud server. */
class RecordingProvider extends ModelPreviewProvider
{
    /** @var list<string> */
    public array $received = [];

    /** What the seam hands back; null models bytes that are not a decodable image. */
    public ?IImage $image = null;

    protected function createImage(string $data): ?IImage
    {
        $this->received[] = $data;

        return $this->image;
    }
}
