<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Repair;

use OCA\ThreeDViewer\Repair\RemoveLegacyThumbnails;
use OCP\Files\IAppData;
use OCP\Files\NotFoundException;
use OCP\Files\SimpleFS\ISimpleFolder;
use OCP\Migration\IOutput;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

/**
 * Thumbnails used to be stored per user under `thumbnails/<userId>/`; they are now stored
 * once per file version under `thumbnails-v2/`. The repair step retires the old tree.
 */
class RemoveLegacyThumbnailsTest extends TestCase
{
    private IAppData&MockObject $appData;
    private IOutput&MockObject $output;
    private RemoveLegacyThumbnails $step;

    protected function setUp(): void
    {
        $this->appData = $this->createMock(IAppData::class);
        $this->output = $this->createMock(IOutput::class);
        $this->step = new RemoveLegacyThumbnails($this->appData);
    }

    public function testNameDescribesTheCleanup(): void
    {
        $this->assertSame('Remove per-user 3D model thumbnails', $this->step->getName());
    }

    public function testRemovesLegacyFolder(): void
    {
        $legacy = $this->createMock(ISimpleFolder::class);
        $legacy->expects($this->once())->method('delete');
        $this->appData->expects($this->once())->method('getFolder')->with('thumbnails')->willReturn($legacy);

        $this->step->run($this->output);
    }

    public function testLeavesV2Alone(): void
    {
        $legacy = $this->createMock(ISimpleFolder::class);
        $requested = [];
        $this->appData->method('getFolder')->willReturnCallback(
            function (string $name) use (&$requested, $legacy) {
                $requested[] = $name;

                return $legacy;
            }
        );
        $this->appData->expects($this->never())->method('newFolder');

        $this->step->run($this->output);

        $this->assertSame(['thumbnails'], $requested);
    }

    public function testMissingLegacyFolderIsFine(): void
    {
        $this->appData->method('getFolder')->willThrowException(new NotFoundException());

        $this->step->run($this->output);

        $this->addToAssertionCount(1);
    }

    public function testFolderVanishingDuringDeleteIsFine(): void
    {
        $legacy = $this->createMock(ISimpleFolder::class);
        $legacy->method('delete')->willThrowException(new NotFoundException());
        $this->appData->method('getFolder')->willReturn($legacy);

        $this->step->run($this->output);

        $this->addToAssertionCount(1);
    }
}
