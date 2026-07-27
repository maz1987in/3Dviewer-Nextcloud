<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Service\Exception\UnsupportedFileTypeException;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\ShareFileService;
use OCP\Files\File;
use OCP\Files\NotFoundException;
use OCP\Share\IManager;
use OCP\Share\IShare;
use PHPUnit\Framework\TestCase;

class ShareFileServiceTest extends TestCase
{
    public function testUnsupportedType(): void
    {
        if (!interface_exists(IManager::class)) {
            $this->markTestSkipped('Share interfaces not available');
        }
        $shareManager = $this->createMock(IManager::class);
        $share = $this->createMock(IShare::class);
        $file = $this->createMock(File::class);
        $file->method('getExtension')->willReturn('txt');
        $share->method('getNode')->willReturn($file);
        // Must be a genuinely public, unexpired share, otherwise the access check
        // rejects it before the file type is ever considered.
        $share->method('getShareType')->willReturn(IShare::TYPE_LINK);
        $share->method('getExpirationDate')->willReturn(null);
        $shareManager->method('getShareByToken')->willReturn($share);
        $support = $this->createMock(ModelFileSupport::class);
        $support->method('isSupported')->willReturn(false);
        $service = new ShareFileService($shareManager, $support);
        $this->expectException(UnsupportedFileTypeException::class);
        $service->getFileFromShare('token', null);
    }

    public function testNotFoundShare(): void
    {
        // Nextcloud 33 narrowed IManager::getShareByToken() to a non-nullable IShare,
        // so PHPUnit refuses to stub a null return there. The production null check
        // stays for the 31/32 range this app still supports; the "no share" path on
        // newer servers is covered by the ShareNotFound tests instead.
        $returnType = (new \ReflectionMethod(IManager::class, 'getShareByToken'))->getReturnType();
        if ($returnType !== null && !$returnType->allowsNull()) {
            $this->markTestSkipped('getShareByToken is non-nullable on this Nextcloud version');
        }

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
