<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Controller;

use OCA\ThreeDViewer\Controller\FileController;
use OCA\ThreeDViewer\Service\Exception\UnauthorizedException;
use OCA\ThreeDViewer\Service\Exception\UnsupportedFileTypeException;
use OCA\ThreeDViewer\Service\FileService;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\StreamResponse;
use OCP\Files\File;
use OCP\Files\NotFoundException;
use OCP\IRequest;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class FileControllerTest extends TestCase
{
    /** @var IRequest&MockObject */
    private $request;
    /** @var FileService&MockObject */
    private $fileService;
    /** @var ModelFileSupport&MockObject */
    private $support;

    protected function setUp(): void
    {
        parent::setUp();
        $this->request = $this->createMock(IRequest::class);
        $this->fileService = $this->createMock(FileService::class);
        $this->support = $this->createMock(ModelFileSupport::class);
        $this->support->method('mapContentType')->willReturn('model/obj');
    }

    public function testStreamSuccess(): void
    {
        $file = $this->createMock(File::class);
        $file->method('fopen')->with('r')->willReturn(fopen('php://memory', 'r'));
        $file->method('getName')->willReturn('model.obj');
        $file->method('getMimeType')->willReturn('text/plain');
        $file->method('getExtension')->willReturn('obj');
        $file->method('getSize')->willReturn(123);

        $this->fileService->method('getValidatedFile')->with(42)->willReturn($file);

        $controller = new FileController('threedviewer', $this->request, $this->fileService, $this->support);
        $response = $controller->stream(42);
        $this->assertInstanceOf(StreamResponse::class, $response);
    }

    public function testStreamNotFound(): void
    {
        $this->fileService->method('getValidatedFile')->willThrowException(new NotFoundException('x'));
        $controller = new FileController('threedviewer', $this->request, $this->fileService, $this->support);
        $response = $controller->stream(10);
        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertSame(Http::STATUS_NOT_FOUND, $response->getStatus());
    }

    public function testStreamUnsupported(): void
    {
        $this->fileService->method('getValidatedFile')->willThrowException(new UnsupportedFileTypeException('Unsupported'));
        $controller = new FileController('threedviewer', $this->request, $this->fileService, $this->support);
        $response = $controller->stream(10);
        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertSame(415, $response->getStatus());
    }

    public function testStreamUnauthorized(): void
    {
        $this->fileService->method('getValidatedFile')->willThrowException(new UnauthorizedException('No authenticated user'));
        $controller = new FileController('threedviewer', $this->request, $this->fileService, $this->support);
        $response = $controller->stream(11);
        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertSame(Http::STATUS_UNAUTHORIZED, $response->getStatus());
    }
}
