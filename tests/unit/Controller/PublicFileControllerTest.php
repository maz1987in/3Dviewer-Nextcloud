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
use OCP\ISession;
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
        $c = new PublicFileController('threedviewer', $req, $this->createMock(ISession::class), $service, $support);
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
        $c = new PublicFileController('threedviewer', $req, $this->createMock(ISession::class), $service, $support);
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
        $c = new PublicFileController('threedviewer', $req, $this->createMock(ISession::class), $service, $support);
        $r = $c->stream('tok', 1);
        $this->assertInstanceOf(JSONResponse::class, $r);
        $this->assertSame(415, $r->getStatus());
    }

    public function testStreamSiblingMtlNotFound(): void
    {
        $req = $this->createMock(IRequest::class);
        $service = $this->createMock(ShareFileService::class);
        $support = $this->createMock(ModelFileSupport::class);
        $support->method('mapContentType')->willReturn('text/plain');
        $service->method('getDependencyFromShare')->willThrowException(new NotFoundException('x'));
        $c = new PublicFileController('threedviewer', $req, $this->createMock(ISession::class), $service, $support);
        $r = $c->streamSiblingMtl('tok', 1, 'missing.mtl');
        $this->assertInstanceOf(JSONResponse::class, $r);
        $this->assertSame(Http::STATUS_NOT_FOUND, $r->getStatus());
    }

    /**
     * Anonymous visitors cannot reach the file-listing API, so a texture can only be
     * asked for by the name the material gave it (issue #115).
     */
    public function testStreamDependencyServesATextureWithItsImageContentType(): void
    {
        $req = $this->createMock(IRequest::class);
        $service = $this->createMock(ShareFileService::class);
        $support = $this->createMock(ModelFileSupport::class);
        // A texture served as text/plain or octet-stream is a texture the browser may
        // refuse to decode — the type has to come from the file, not from the route.
        // Response::getHeaders() reaches into the server container, so the wire header
        // itself is asserted by scripts/live-public-share-check.mjs.
        $support->expects($this->once())->method('mapContentType')
            ->with('png')->willReturn('image/png');
        $texture = $this->createMock(File::class);
        $texture->method('fopen')->willReturn(fopen('php://memory', 'r'));
        $texture->method('getExtension')->willReturn('png');
        $texture->method('getSize')->willReturn(2048);
        $texture->method('getName')->willReturn('wood.png');
        $service->method('getDependencyFromShare')->willReturn($texture);

        $c = new PublicFileController('threedviewer', $req, $this->createMock(ISession::class), $service, $support);
        $r = $c->streamDependency('tok', 1, 'wood.png');

        $this->assertInstanceOf(StreamResponse::class, $r);
    }

    public function testStreamDependencyNotFound(): void
    {
        $req = $this->createMock(IRequest::class);
        $service = $this->createMock(ShareFileService::class);
        $support = $this->createMock(ModelFileSupport::class);
        $service->method('getDependencyFromShare')->willThrowException(new NotFoundException('x'));

        $c = new PublicFileController('threedviewer', $req, $this->createMock(ISession::class), $service, $support);
        $r = $c->streamDependency('tok', 1, 'passport-scan.png');

        $this->assertInstanceOf(JSONResponse::class, $r);
        $this->assertSame(Http::STATUS_NOT_FOUND, $r->getStatus());
    }

    /**
     * The MTL-only route predates the general one and is documented, so it keeps working
     * — through the same declaration check.
     */
    public function testLegacyMtlRouteResolvesThroughTheDependencyLookup(): void
    {
        $req = $this->createMock(IRequest::class);
        $service = $this->createMock(ShareFileService::class);
        $support = $this->createMock(ModelFileSupport::class);
        $support->method('mapContentType')->willReturn('text/plain');
        $mtl = $this->createMock(File::class);
        $mtl->method('fopen')->willReturn(fopen('php://memory', 'r'));
        $mtl->method('getExtension')->willReturn('mtl');
        $mtl->method('getSize')->willReturn(5);
        $mtl->method('getName')->willReturn('chair.mtl');
        $service->expects($this->once())->method('getDependencyFromShare')
            ->with('tok', 1, 'chair.mtl')->willReturn($mtl);

        $c = new PublicFileController('threedviewer', $req, $this->createMock(ISession::class), $service, $support);

        $this->assertInstanceOf(StreamResponse::class, $c->streamSiblingMtl('tok', 1, 'chair.mtl'));
    }

    public function testStreamSiblingMtlUnsupported(): void
    {
        $req = $this->createMock(IRequest::class);
        $service = $this->createMock(ShareFileService::class);
        $support = $this->createMock(ModelFileSupport::class);
        $support->method('mapContentType')->willReturn('text/plain');
        $service->method('getDependencyFromShare')->willThrowException(new UnsupportedFileTypeException('not obj'));
        $c = new PublicFileController('threedviewer', $req, $this->createMock(ISession::class), $service, $support);
        $r = $c->streamSiblingMtl('tok', 1, 'model.mtl');
        $this->assertInstanceOf(JSONResponse::class, $r);
        $this->assertSame(415, $r->getStatus());
    }
}
