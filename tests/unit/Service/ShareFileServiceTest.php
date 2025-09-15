<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Service\ShareFileService;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\Exception\UnsupportedFileTypeException;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\NotFoundException;
use OCP\Share\IManager;
use OCP\Share\IShare;
use PHPUnit\Framework\TestCase;

class ShareFileServiceTest extends TestCase {
    public function testUnsupportedType(): void {
        if (!interface_exists(IManager::class)) {
            $this->markTestSkipped('Share interfaces not available');
        }
        $shareManager = $this->createMock(IManager::class);
        $share = $this->createMock(IShare::class);
        $file = $this->createMock(File::class);
        $file->method('getExtension')->willReturn('txt');
        $share->method('getNode')->willReturn($file);
        $shareManager->method('getShareByToken')->willReturn($share);
    $support = $this->createMock(ModelFileSupport::class);
    $support->method('isSupported')->willReturn(false);
    $service = new ShareFileService($shareManager, $support);
        $this->expectException(UnsupportedFileTypeException::class);
        $service->getFileFromShare('token', null);
    }

    public function testNotFoundShare(): void {
        if (!interface_exists(IManager::class)) {
            $this->markTestSkipped('Share interfaces not available');
        }
        $shareManager = $this->createMock(IManager::class);
        $shareManager->method('getShareByToken')->willReturn(null);
    $support = $this->createMock(ModelFileSupport::class);
    $service = new ShareFileService($shareManager, $support);
        $this->expectException(NotFoundException::class);
        $service->getFileFromShare('missing', null);
    }
}
