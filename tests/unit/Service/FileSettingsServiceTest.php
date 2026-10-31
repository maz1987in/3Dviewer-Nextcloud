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

    public function testNothingIsStoredByDefault(): void
    {
        $this->mapper->method('findByFile')->with(7)->willReturn(null);

        $this->assertSame(['unit' => null, 'up' => null], $this->service->settings(7));
    }

    public function testStoresAKnownUnitForAUnitlessFormat(): void
    {
        $this->mapper->method('findByFile')->willReturn(null);
        $this->mapper->expects($this->once())->method('insert')->with($this->callback(
            fn (FileSetting $s) => $s->getFileId() === 7 && $s->getUnit() === 'in'
                && $s->getUpdatedBy() === 'alice' && $s->getUpdatedAt() === 1_800_000_000
        ))->willReturnArgument(0);

        $this->assertSame('in', $this->service->set(7, 'model.STL', ['unit' => 'in'], 'alice')['unit']);
    }

    public function testChangesAUnitAlreadyStored(): void
    {
        $this->mapper->method('findByFile')->willReturn($this->setting('in'));
        $this->mapper->expects($this->never())->method('insert');
        $this->mapper->expects($this->once())->method('update')
            ->with($this->callback(fn (FileSetting $s) => $s->getUnit() === 'cm' && $s->getUpdatedBy() === 'bob'))
            ->willReturnArgument(0);

        $this->assertSame('cm', $this->service->set(7, 'model.obj', ['unit' => 'cm'], 'bob')['unit']);
    }

    public function testNullRemovesTheUnit(): void
    {
        $this->mapper->method('findByFile')->willReturn($this->setting('in'));
        $this->mapper->expects($this->once())->method('deleteByFile')->with(7);
        $this->mapper->expects($this->never())->method('insert');

        $this->assertNull($this->service->set(7, 'model.stl', ['unit' => null], 'alice')['unit']);
    }

    public function testClearingWhatWasNeverSetWritesNothing(): void
    {
        $this->mapper->method('findByFile')->willReturn(null);
        $this->mapper->expects($this->never())->method('insert');
        $this->mapper->expects($this->never())->method('deleteByFile');

        $this->assertNull($this->service->set(7, 'scan.las', ['up' => null], 'alice')['up']);
    }

    public function testSetUpStoresAndReadsBack(): void
    {
        $this->mapper->method('findByFile')->willReturn(null);
        $this->mapper->expects($this->once())->method('insert')->with($this->callback(
            fn (FileSetting $s) => $s->getFileId() === 7 && $s->getUp() === '+z' && $s->getUnit() === null
        ))->willReturnArgument(0);

        $this->assertSame('+z', $this->service->set(7, 'scan.LAS', ['up' => '+z'], 'alice')['up']);
    }

    /** @return array<string, array{mixed}> */
    public static function notAnUp(): array
    {
        return ['a word' => ['up'], 'an x axis' => ['+x'], 'no sign' => ['y'], 'case' => ['+Y'], 'a number' => [1]];
    }

    #[DataProvider('notAnUp')]
    public function testSetUpRefusesAnUnknownValue(mixed $up): void
    {
        $this->mapper->expects($this->never())->method('insert');

        $this->expectException(InvalidFileSettingException::class);
        $this->service->set(7, 'scan.las', ['up' => $up], 'alice')['up'];
    }

    public function testSetUpRefusesAMeshOnlyFormat(): void
    {
        $this->mapper->expects($this->never())->method('insert');

        $this->expectException(InvalidFileSettingException::class);
        $this->service->set(7, 'part.stl', ['up' => '+z'], 'alice')['up'];
    }

    public function testClearingTheUpKeepsTheUnit(): void
    {
        $this->mapper->method('findByFile')->willReturn($this->setting('ft', '-y'));
        $this->mapper->expects($this->never())->method('deleteByFile');
        $this->mapper->expects($this->once())->method('update')
            ->with($this->callback(fn (FileSetting $s) => $s->getUnit() === 'ft' && $s->getUp() === null))
            ->willReturnArgument(0);

        $this->assertNull($this->service->set(7, 'scan.las', ['up' => null], 'alice')['up']);
    }

    public function testClearingBothDeletesTheRow(): void
    {
        $this->mapper->method('findByFile')->willReturn($this->setting('ft', '-y'));
        $this->mapper->expects($this->once())->method('deleteByFile')->with(7);

        $this->assertSame(['unit' => null, 'up' => null], $this->service->set(7, 'scan.las', ['unit' => null, 'up' => null], 'alice'));
    }

    public function testOneBadValueSavesNeither(): void
    {
        $this->mapper->method('findByFile')->willReturn(null);
        $this->mapper->expects($this->never())->method('insert');

        $this->expectException(InvalidFileSettingException::class);
        $this->service->set(7, 'scan.las', ['unit' => 'ft', 'up' => 'sideways'], 'alice');
    }

    public function testSettingsReadsBoth(): void
    {
        $this->mapper->method('findByFile')->with(7)->willReturn($this->setting('us-ft', '+z'));

        $this->assertSame(['unit' => 'us-ft', 'up' => '+z'], $this->service->settings(7));
    }

    public function testASplatCanBeTurnedAndGivenAUnit(): void
    {
        $this->mapper->method('findByFile')->willReturn(null);
        $this->mapper->method('insert')->willReturnArgument(0);

        $this->assertSame('-y', $this->service->set(7, 'capture.splat', ['up' => '-y'], 'alice')['up']);
        $this->assertSame('cm', $this->service->set(8, 'capture.spz', ['unit' => 'cm'], 'alice')['unit']);
        foreach (['splat', 'spz'] as $ext) {
            $this->assertContains($ext, FileSettingsService::UP_FORMATS, $ext);
            $this->assertContains($ext, FileSettingsService::UNITLESS_FORMATS, $ext);
        }
    }

    public function testScanFormatsAreUnitless(): void
    {
        foreach (['las', 'laz', 'pcd', 'xyz', 'ply'] as $ext) {
            $this->assertContains($ext, FileSettingsService::UNITLESS_FORMATS, $ext);
        }
        $this->assertNotContains('e57', FileSettingsService::UNITLESS_FORMATS, 'E57 stores SI metres');
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
        $this->service->set(7, 'model.stl', ['unit' => $unit], 'alice')['unit'];
    }

    public function testRefusesAFormatThatRecordsItsOwnUnit(): void
    {
        $this->mapper->expects($this->never())->method('insert');

        $this->expectException(InvalidFileSettingException::class);
        $this->service->set(7, 'model.glb', ['unit' => 'in'], 'alice')['unit'];
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

        $this->assertSame('in', $this->service->set(7, 'model.stl', ['unit' => 'in'], 'alice')['unit']);
    }

    public function testOtherDatabaseFailuresPropagate(): void
    {
        $failure = $this->createMock(Exception::class);
        $failure->method('getReason')->willReturn(Exception::REASON_CONNECTION_LOST);
        $this->mapper->method('findByFile')->willReturn(null);
        $this->mapper->method('insert')->willThrowException($failure);

        $this->expectException(Exception::class);
        $this->service->set(7, 'model.stl', ['unit' => 'in'], 'alice')['unit'];
    }

    private function setting(?string $unit, ?string $up = null): FileSetting
    {
        $setting = new FileSetting();
        $setting->setFileId(7);
        $setting->setUnit($unit);
        $setting->setUp($up);
        $setting->setUpdatedBy('someone');
        $setting->setUpdatedAt(1);

        return $setting;
    }
}
