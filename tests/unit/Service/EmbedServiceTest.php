<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Service\EmbedOrigins;
use OCA\ThreeDViewer\Service\EmbedService;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\ShareFileService;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\NotFoundException;
use OCP\Share\IAttributes;
use OCP\Share\IShare;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class EmbedServiceTest extends TestCase
{
    private EmbedOrigins&MockObject $origins;
    private ShareFileService&MockObject $shares;
    private EmbedService $service;

    protected function setUp(): void
    {
        $this->origins = $this->createMock(EmbedOrigins::class);
        $this->origins->method('isEnabled')->willReturn(true);
        $this->shares = $this->createMock(ShareFileService::class);
        $support = $this->createMock(ModelFileSupport::class);
        $support->method('isSupported')->willReturnCallback(static fn (string $ext): bool => in_array($ext, ['stl', 'obj', 'glb'], true));
        $this->service = new EmbedService($this->origins, $this->shares, $support);
    }

    public function testNothingIsEmbeddableWithEmbeddingOff(): void
    {
        $origins = $this->createMock(EmbedOrigins::class);
        $origins->method('isEnabled')->willReturn(false);
        $this->shares->expects($this->never())->method('findValidLinkShare');
        $service = new EmbedService($origins, $this->shares, $this->createMock(ModelFileSupport::class));

        $this->assertNull($service->embeddable('tok'));
    }

    public function testNoShareIsNotEmbeddable(): void
    {
        $this->shares->method('findValidLinkShare')->willReturn(null);

        $this->assertNull($this->service->embeddable('tok'));
    }

    public function testAnEmailShareIsNotEmbeddable(): void
    {
        $this->shares->method('findValidLinkShare')->willReturn($this->share(type: IShare::TYPE_EMAIL));

        $this->assertNull($this->service->embeddable('tok'));
    }

    public function testAPasswordProtectedShareIsNotEmbeddable(): void
    {
        $this->shares->method('findValidLinkShare')->willReturn($this->share(password: '$2y$hash'));

        $this->assertNull($this->service->embeddable('tok'));
    }

    public function testAFolderShareIsNotEmbeddable(): void
    {
        $this->shares->method('findValidLinkShare')->willReturn($this->share(node: $this->createMock(Folder::class)));

        $this->assertNull($this->service->embeddable('tok'));
    }

    public function testAnUnsupportedFileIsNotEmbeddable(): void
    {
        $this->shares->method('findValidLinkShare')->willReturn($this->share(node: $this->file('notes.txt', 'txt')));

        $this->assertNull($this->service->embeddable('tok'));
    }

    public function testAShareWhoseFileIsGoneIsNotEmbeddable(): void
    {
        $share = $this->share(node: false);
        $share->method('getNode')->willThrowException(new NotFoundException());
        $this->shares->method('findValidLinkShare')->willReturn($share);

        $this->assertNull($this->service->embeddable('tok'));
    }

    public function testALinkShareOfAModelIsEmbeddableWithDownloads(): void
    {
        $file = $this->file('part.STL', 'STL');
        $share = $this->share(node: $file);
        $this->shares->method('findValidLinkShare')->with('tok')->willReturn($share);

        $target = $this->service->embeddable('tok');

        $this->assertNotNull($target);
        $this->assertSame($share, $target->share);
        $this->assertSame($file, $target->file);
        $this->assertTrue($target->canDownload);
    }

    public function testNoDownloadWhenTheShareHidesIt(): void
    {
        $this->shares->method('findValidLinkShare')->willReturn($this->share(hideDownload: true));

        $this->assertFalse($this->service->embeddable('tok')?->canDownload);
    }

    public function testNoDownloadWhenTheShareForbidsItByAttribute(): void
    {
        $attributes = $this->createMock(IAttributes::class);
        $attributes->method('getAttribute')->willReturnCallback(
            static fn (string $scope, string $key): mixed => $scope === 'permissions' && $key === 'download' ? false : null,
        );
        $this->shares->method('findValidLinkShare')->willReturn($this->share(attributes: $attributes));

        $this->assertFalse($this->service->embeddable('tok')?->canDownload);
    }

    private function file(string $name, string $extension): File&MockObject
    {
        $file = $this->createMock(File::class);
        $file->method('getName')->willReturn($name);
        $file->method('getExtension')->willReturn($extension);

        return $file;
    }

    /**
     * @param mixed $node the shared node; null for a model, false to leave getNode unset
     */
    private function share(
        int $type = IShare::TYPE_LINK,
        ?string $password = null,
        mixed $node = null,
        bool $hideDownload = false,
        ?IAttributes $attributes = null,
    ): IShare&MockObject {
        $share = $this->createMock(IShare::class);
        $share->method('getShareType')->willReturn($type);
        $share->method('getPassword')->willReturn($password);
        $share->method('getHideDownload')->willReturn($hideDownload);
        $share->method('getAttributes')->willReturn($attributes);
        if ($node !== false) {
            $share->method('getNode')->willReturn($node ?? $this->file('part.stl', 'stl'));
        }

        return $share;
    }
}
