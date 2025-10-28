<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Controller;

use OCA\ThreeDViewer\Controller\PublicFileController;
use OCA\ThreeDViewer\Service\Exception\UnsupportedFileTypeException;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\ShareFileService;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\StreamResponse;
use OCP\Files\File;
use OCP\Files\NotFoundException;
use OCP\IRequest;
use PHPUnit\Framework\TestCase;

class PublicFileControllerTest extends TestCase
{
    public function testStreamSuccess(): void
    {
        $req = $this->createMock(IRequest::class);
        $service = $this->createMock(ShareFileService::class);
        $support = $this->createMock(ModelFileSupport::class);
        $support->method('mapContentType')->willReturn('model/obj');
        $file = $this->createMock(File::class);
        $file->method('fopen')->willReturn(fopen('php://memory', 'r'));
        $file->method('getExtension')->willReturn('obj');
        $file->method('getSize')->willReturn(10);
        $file->method('getName')->willReturn('model.obj');
        $service->method('getFileFromShare')->willReturn($file);
        $c = new PublicFileController('threedviewer', $req, $service, $support);
        $r = $c->stream('tok', 1);
        $this->assertInstanceOf(StreamResponse::class, $r);
    }

    public function testStreamNotFound(): void
    {
        $req = $this->createMock(IRequest::class);
        $service = $this->createMock(ShareFileService::class);
        $support = $this->createMock(ModelFileSupport::class);
        $support->method('mapContentType')->willReturn('model/obj');
        $service->method('getFileFromShare')->willThrowException(new NotFoundException('x'));
        $c = new PublicFileController('threedviewer', $req, $service, $support);
        $r = $c->stream('tok', 1);
        $this->assertInstanceOf(JSONResponse::class, $r);
        $this->assertSame(Http::STATUS_NOT_FOUND, $r->getStatus());
    }

    public function testStreamUnsupported(): void
    {
        $req = $this->createMock(IRequest::class);
        $service = $this->createMock(ShareFileService::class);
        $support = $this->createMock(ModelFileSupport::class);
        $support->method('mapContentType')->willReturn('model/obj');
        $service->method('getFileFromShare')->willThrowException(new UnsupportedFileTypeException('bad'));
        $c = new PublicFileController('threedviewer', $req, $service, $support);
        $r = $c->stream('tok', 1);
        $this->assertInstanceOf(JSONResponse::class, $r);
        $this->assertSame(415, $r->getStatus());
    }

    public function testStreamSiblingMtlSuccess(): void
    {
        $req = $this->createMock(IRequest::class);
        $service = $this->createMock(ShareFileService::class);
        $support = $this->createMock(ModelFileSupport::class);
        $support->method('mapContentType')->willReturn('text/plain');
        $mtl = $this->createMock(File::class);
        $mtl->method('fopen')->willReturn(fopen('php://memory', 'r'));
        $mtl->method('getExtension')->willReturn('mtl');
        $mtl->method('getSize')->willReturn(5);
        $service->method('getSiblingMaterialFromShare')->willReturn($mtl);
        $c = new PublicFileController('threedviewer', $req, $service, $support);
        $r = $c->streamSiblingMtl('tok', 1, 'model.mtl');
        $this->assertInstanceOf(StreamResponse::class, $r);
    }

    public function testStreamSiblingMtlNotFound(): void
    {
        $req = $this->createMock(IRequest::class);
        $service = $this->createMock(ShareFileService::class);
        $support = $this->createMock(ModelFileSupport::class);
        $support->method('mapContentType')->willReturn('text/plain');
        $service->method('getSiblingMaterialFromShare')->willThrowException(new NotFoundException('x'));
        $c = new PublicFileController('threedviewer', $req, $service, $support);
        $r = $c->streamSiblingMtl('tok', 1, 'missing.mtl');
        $this->assertInstanceOf(JSONResponse::class, $r);
        $this->assertSame(Http::STATUS_NOT_FOUND, $r->getStatus());
    }

    public function testStreamSiblingMtlUnsupported(): void
    {
        $req = $this->createMock(IRequest::class);
        $service = $this->createMock(ShareFileService::class);
        $support = $this->createMock(ModelFileSupport::class);
        $support->method('mapContentType')->willReturn('text/plain');
        $service->method('getSiblingMaterialFromShare')->willThrowException(new UnsupportedFileTypeException('not obj'));
        $c = new PublicFileController('threedviewer', $req, $service, $support);
        $r = $c->streamSiblingMtl('tok', 1, 'model.mtl');
        $this->assertInstanceOf(JSONResponse::class, $r);
        $this->assertSame(415, $r->getStatus());
    }
}
