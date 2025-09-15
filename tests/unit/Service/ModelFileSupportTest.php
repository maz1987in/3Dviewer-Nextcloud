<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\NotFoundException;
use OCA\ThreeDViewer\Service\Exception\UnsupportedFileTypeException;
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\MockObject\MockObject;

class ModelFileSupportTest extends TestCase {
    private ModelFileSupport $support;

    protected function setUp(): void {
        parent::setUp();
        $this->support = new ModelFileSupport();
    }

    public function testSupportedExtensionsListContainsCoreTypes(): void {
        $exts = $this->support->getSupportedExtensions();
        $this->assertContains('obj', $exts);
        $this->assertContains('glb', $exts);
        $this->assertContains('gltf', $exts);
        $this->assertContains('stl', $exts);
        $this->assertContains('ply', $exts);
        $this->assertContains('mtl', $exts);
        $this->assertContains('fbx', $exts);
    }

    public function testMapContentType(): void {
        $this->assertSame('model/gltf-binary', $this->support->mapContentType('glb'));
        $this->assertSame('model/gltf+json', $this->support->mapContentType('gltf'));
        $this->assertSame('model/obj', $this->support->mapContentType('obj'));
        $this->assertSame('model/stl', $this->support->mapContentType('stl'));
        $this->assertSame('model/ply', $this->support->mapContentType('ply'));
        $this->assertSame('text/plain', $this->support->mapContentType('mtl'));
        $this->assertSame('application/octet-stream', $this->support->mapContentType('fbx'));
        $this->assertSame('application/octet-stream', $this->support->mapContentType('unknown'));
    }

    public function testFindSiblingMtlSuccess(): void {
        /** @var File&MockObject $obj */
        $obj = $this->createMock(File::class);
        /** @var File&MockObject $mtl */
        $mtl = $this->createMock(File::class);
        /** @var Folder&MockObject $folder */
        $folder = $this->createMock(Folder::class);
        $obj->method('getExtension')->willReturn('obj');
        $obj->method('getParent')->willReturn($folder);
        $mtl->method('getName')->willReturn('model.mtl');
        $mtl->method('getExtension')->willReturn('mtl');
        $folder->method('getDirectoryListing')->willReturn([$mtl]);

        $found = $this->support->findSiblingMtl($obj, 'model.mtl');
        $this->assertSame($mtl, $found);
    }

    public function testFindSiblingMtlWrongBaseType(): void {
        $obj = $this->createMock(File::class);
        $obj->method('getExtension')->willReturn('glb');
        $this->expectException(UnsupportedFileTypeException::class);
        $this->support->findSiblingMtl($obj, 'model.mtl');
    }

    public function testFindSiblingMtlMissingParent(): void {
        $obj = $this->createMock(File::class);
        $obj->method('getExtension')->willReturn('obj');
        $obj->method('getParent')->willReturn(null);
        $this->expectException(NotFoundException::class);
        $this->support->findSiblingMtl($obj, 'model.mtl');
    }

    public function testFindSiblingMtlNotFound(): void {
        $obj = $this->createMock(File::class);
        $folder = $this->createMock(Folder::class);
        $obj->method('getExtension')->willReturn('obj');
        $obj->method('getParent')->willReturn($folder);
        $folder->method('getDirectoryListing')->willReturn([]);
        $this->expectException(NotFoundException::class);
        $this->support->findSiblingMtl($obj, 'missing.mtl');
    }

    public function testFindSiblingMtlSiblingWrongType(): void {
        $obj = $this->createMock(File::class);
        $folder = $this->createMock(Folder::class);
        $fake = $this->createMock(File::class);
        $obj->method('getExtension')->willReturn('obj');
        $obj->method('getParent')->willReturn($folder);
        $fake->method('getName')->willReturn('model.mtl');
        $fake->method('getExtension')->willReturn('txt');
        $folder->method('getDirectoryListing')->willReturn([$fake]);
        $this->expectException(UnsupportedFileTypeException::class);
        $this->support->findSiblingMtl($obj, 'model.mtl');
    }
}
