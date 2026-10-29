<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Db\FileSetting;
use OCA\ThreeDViewer\Db\FileSettingMapper;
use OCA\ThreeDViewer\Service\Exception\InvalidFileSettingException;
use OCA\ThreeDViewer\Service\FileSettingsService;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\DB\Exception;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class FileSettingsServiceTest extends TestCase
{
    private FileSettingMapper&MockObject $mapper;
    private FileSettingsService $service;

    protected function setUp(): void
    {
        $this->mapper = $this->createMock(FileSettingMapper::class);
        $time = $this->createMock(ITimeFactory::class);
        $time->method('getTime')->willReturn(1_800_000_000);
        $this->service = new FileSettingsService($this->mapper, $time);
    }

    public function testUnitIsNullWhenNoneIsStored(): void
    {
        $this->mapper->method('findByFile')->with(7)->willReturn(null);

        $this->assertNull($this->service->unit(7));
    }

    public function testStoresAKnownUnitForAUnitlessFormat(): void
    {
        $this->mapper->method('findByFile')->willReturn(null);
        $this->mapper->expects($this->once())->method('insert')->with($this->callback(
            fn (FileSetting $s) => $s->getFileId() === 7 && $s->getUnit() === 'in'
                && $s->getUpdatedBy() === 'alice' && $s->getUpdatedAt() === 1_800_000_000
        ))->willReturnArgument(0);

        $this->assertSame('in', $this->service->setUnit(7, 'model.STL', 'in', 'alice'));
    }

    public function testChangesAUnitAlreadyStored(): void
    {
        $this->mapper->method('findByFile')->willReturn($this->setting('in'));
        $this->mapper->expects($this->never())->method('insert');
        $this->mapper->expects($this->once())->method('update')
            ->with($this->callback(fn (FileSetting $s) => $s->getUnit() === 'cm' && $s->getUpdatedBy() === 'bob'))
            ->willReturnArgument(0);

        $this->assertSame('cm', $this->service->setUnit(7, 'model.obj', 'cm', 'bob'));
    }

    public function testNullRemovesTheUnit(): void
    {
        $this->mapper->expects($this->once())->method('deleteByFile')->with(7);
        $this->mapper->expects($this->never())->method('insert');

        $this->assertNull($this->service->setUnit(7, 'model.stl', null, 'alice'));
    }

    /** @return array<string, array{mixed}> */
    public static function notAUnit(): array
    {
        return ['unknown' => ['furlong'], 'a number' => [42], 'a list' => [['in']], 'empty' => [''], 'case' => ['IN']];
    }

    #[DataProvider('notAUnit')]
    public function testRefusesAnUnknownUnit(mixed $unit): void
    {
        $this->mapper->expects($this->never())->method('insert');

        $this->expectException(InvalidFileSettingException::class);
        $this->service->setUnit(7, 'model.stl', $unit, 'alice');
    }

    public function testRefusesAFormatThatRecordsItsOwnUnit(): void
    {
        $this->mapper->expects($this->never())->method('insert');

        $this->expectException(InvalidFileSettingException::class);
        $this->service->setUnit(7, 'model.glb', 'in', 'alice');
    }

    /** Two editors at once: the second insert hits the unique index and updates instead. */
    public function testASecondWriterUpdatesTheRowTheFirstMade(): void
    {
        $violation = $this->createMock(Exception::class);
        $violation->method('getReason')->willReturn(Exception::REASON_UNIQUE_CONSTRAINT_VIOLATION);
        $this->mapper->method('findByFile')->willReturnOnConsecutiveCalls(null, $this->setting('cm'));
        $this->mapper->method('insert')->willThrowException($violation);
        $this->mapper->expects($this->once())->method('update')
            ->with($this->callback(fn (FileSetting $s) => $s->getUnit() === 'in'))
            ->willReturnArgument(0);

        $this->assertSame('in', $this->service->setUnit(7, 'model.stl', 'in', 'alice'));
    }

    public function testOtherDatabaseFailuresPropagate(): void
    {
        $failure = $this->createMock(Exception::class);
        $failure->method('getReason')->willReturn(Exception::REASON_CONNECTION_LOST);
        $this->mapper->method('findByFile')->willReturn(null);
        $this->mapper->method('insert')->willThrowException($failure);

        $this->expectException(Exception::class);
        $this->service->setUnit(7, 'model.stl', 'in', 'alice');
    }

    private function setting(string $unit): FileSetting
    {
        $setting = new FileSetting();
        $setting->setFileId(7);
        $setting->setUnit($unit);
        $setting->setUpdatedBy('someone');
        $setting->setUpdatedAt(1);

        return $setting;
    }
}
