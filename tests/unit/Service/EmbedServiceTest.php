<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Constants\SupportedFormats;
use OCA\ThreeDViewer\Service\EmbedOrigins;
use OCA\ThreeDViewer\Service\EmbedService;
use OCA\ThreeDViewer\Service\ModelFileSupport;
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
    private EmbedService $service;

    protected function setUp(): void
    {
        $this->origins = $this->createMock(EmbedOrigins::class);
        $this->origins->method('isEnabled')->willReturn(true);
        $this->service = new EmbedService($this->origins, new ModelFileSupport());
    }

    public function testNothingIsEmbeddableWithEmbeddingOff(): void
    {
        $origins = $this->createMock(EmbedOrigins::class);
        $origins->method('isEnabled')->willReturn(false);
        $service = new EmbedService($origins, new ModelFileSupport());

        $this->assertNull($service->embeddable($this->share()));
    }

    public function testAnEmailShareIsNotEmbeddable(): void
    {
        $this->assertNull($this->service->embeddable($this->share(type: IShare::TYPE_EMAIL)));
    }

    public function testAPasswordProtectedShareIsNotEmbeddable(): void
    {
        $this->assertNull($this->service->embeddable($this->share(password: '$2y$hash')));
    }

    public function testAFolderShareIsNotEmbeddable(): void
    {
        $this->assertNull($this->service->embeddable($this->share(node: $this->createMock(Folder::class))));
    }

    public function testAnUnsupportedFileIsNotEmbeddable(): void
    {
        $this->assertNull($this->service->embeddable($this->share(node: $this->file('notes.txt', 'txt'))));
    }

    /**
     * A photo, texture or companion file is not a model the viewer can open on its own,
     * whatever the app streams beside one.
     *
     * @dataProvider companionFiles
     */
    public function testACompanionFileIsNotEmbeddable(string $name, string $extension): void
    {
        $this->assertNull($this->service->embeddable($this->share(node: $this->file($name, $extension))));
    }

    /** @return array<string, array{string, string}> */
    public static function companionFiles(): array
    {
        return [
            'photo' => ['holiday.JPG', 'JPG'],
            'texture' => ['checker.png', 'png'],
            'material' => ['part.mtl', 'mtl'],
            'glTF buffer' => ['scene.bin', 'bin'],
        ];
    }

    public function testEveryModelFormatIsEmbeddable(): void
    {
        foreach (SupportedFormats::getModelExtensions() as $ext) {
            $this->assertNotNull($this->service->embeddable($this->share(node: $this->file('model.' . $ext, $ext))), $ext);
        }
    }

    public function testAShareWhoseFileIsGoneIsNotEmbeddable(): void
    {
        $share = $this->share(node: false);
        $share->method('getNode')->willThrowException(new NotFoundException());

        $this->assertNull($this->service->embeddable($share));
    }

    public function testALinkShareOfAModelIsEmbeddableWithDownloads(): void
    {
        $file = $this->file('part.STL', 'STL');
        $share = $this->share(node: $file);

        $target = $this->service->embeddable($share);

        $this->assertNotNull($target);
        $this->assertSame($file, $target->file);
        $this->assertTrue($target->canDownload);
    }

    public function testNoDownloadWhenTheShareHidesIt(): void
    {
        $this->assertFalse($this->service->embeddable($this->share(hideDownload: true))?->canDownload);
    }

    public function testNoDownloadWhenTheShareForbidsItByAttribute(): void
    {
        $attributes = $this->createMock(IAttributes::class);
        $attributes->method('getAttribute')->willReturnCallback(
            static fn (string $scope, string $key): mixed => $scope === 'permissions' && $key === 'download' ? false : null,
        );
        $this->assertFalse($this->service->embeddable($this->share(attributes: $attributes))?->canDownload);
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
