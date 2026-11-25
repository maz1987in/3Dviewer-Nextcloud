<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Db\ModelStat;
use OCA\ThreeDViewer\Db\ModelStatMapper;
use OCA\ThreeDViewer\Service\ModelStatsService;
use OCA\ThreeDViewer\Service\ModelStatsStoreResult;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\DB\Exception;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class ModelStatsServiceTest extends TestCase
{
    private ModelStatMapper&MockObject $mapper;
    private ModelStatsService $service;

    protected function setUp(): void
    {
        $this->mapper = $this->createMock(ModelStatMapper::class);
        $time = $this->createMock(ITimeFactory::class);
        $time->method('getTime')->willReturn(1_700_000_000);
        $this->service = new ModelStatsService($this->mapper, $time, $this->createMock(LoggerInterface::class));
    }

    /** @return array<string, mixed> */
    private static function mesh(array $over = []): array
    {
        return array_replace([
            'v' => 1,
            'kind' => 'mesh',
            'size' => [120.5, 45, 80],
            'unit' => ['mm' => 1, 'changeable' => true],
            'up' => null,
            'triangles' => 12,
            'vertices' => 8,
            'points' => 0,
            'splats' => 0,
            'parts' => 1,
            'materials' => 1,
            'textures' => 0,
            'area' => 500.5,
            'volume' => null,
            'watertight' => null,
            'layers' => null,
            'printSeconds' => null,
        ], $over);
    }

    private function violation(int $reason): Exception&MockObject
    {
        $exception = $this->createMock(Exception::class);
        $exception->method('getReason')->willReturn($reason);

        return $exception;
    }

    private function row(string $etag): ModelStat
    {
        $row = new ModelStat();
        $row->setFileId(7);
        $row->setEtag($etag);
        $row->setStats((string) json_encode(ModelStatsService::normalize(self::mesh())));

        return $row;
    }

    public function testNormalizeRebuildsAMeshFromTheFieldsItKnows(): void
    {
        $stats = ModelStatsService::normalize(self::mesh());

        $this->assertSame([120.5, 45.0, 80.0], $stats['size']);
        $this->assertSame(['mm' => 1.0, 'changeable' => true], $stats['unit']);
        $this->assertSame(12, $stats['triangles']);
        $this->assertNull($stats['volume']);
    }

    public function testNormalizeFillsWhatAClientLeftOut(): void
    {
        $stats = ModelStatsService::normalize(['v' => 1, 'kind' => 'points', 'size' => [1, 2, 3], 'unit' => ['mm' => 1000, 'changeable' => false], 'points' => 5.0]);

        $this->assertSame(5, $stats['points']);
        $this->assertSame(0, $stats['triangles']);
        $this->assertNull($stats['area']);
        $this->assertNull($stats['up']);
    }

    public function testNormalizeAcceptsEveryKindAndUp(): void
    {
        foreach (ModelStatsService::KINDS as $kind) {
            $this->assertNotNull(ModelStatsService::normalize(self::mesh(['kind' => $kind, 'up' => '+z'])), $kind);
        }
    }

    /** @return array<string, array{0: array<string, mixed>}> */
    public static function rejected(): array
    {
        return [
            'unknown field' => [self::mesh(['extra' => 1])],
            'wrong version' => [self::mesh(['v' => 2])],
            'string version' => [self::mesh(['v' => '1'])],
            'unknown kind' => [self::mesh(['kind' => 'cad'])],
            'kind not a string' => [self::mesh(['kind' => ['mesh']])],
            'size too short' => [self::mesh(['size' => [1, 2]])],
            'size too long' => [self::mesh(['size' => [1, 2, 3, 4]])],
            'size keyed' => [self::mesh(['size' => ['x' => 1, 'y' => 2, 'z' => 3]])],
            'size negative' => [self::mesh(['size' => [1, -2, 3]])],
            'size a string' => [self::mesh(['size' => [1, '2', 3]])],
            'size absurd' => [self::mesh(['size' => [1, 2, 1e300]])],
            'size infinite' => [self::mesh(['size' => [1, 2, INF]])],
            'size NaN' => [self::mesh(['size' => [1, 2, NAN]])],
            'unit missing' => [array_diff_key(self::mesh(), ['unit' => 1])],
            'unit zero' => [self::mesh(['unit' => ['mm' => 0, 'changeable' => true]])],
            'unit huge' => [self::mesh(['unit' => ['mm' => 1e12, 'changeable' => true]])],
            'unit changeable not a bool' => [self::mesh(['unit' => ['mm' => 1, 'changeable' => 1]])],
            'unit with an extra field' => [self::mesh(['unit' => ['mm' => 1, 'changeable' => true, 'x' => 1]])],
            'up unknown' => [self::mesh(['up' => 'sideways'])],
            'up not a string' => [self::mesh(['up' => 5])],
            'count negative' => [self::mesh(['triangles' => -1])],
            'count a fraction' => [self::mesh(['vertices' => 1.5])],
            'count a string' => [self::mesh(['parts' => '3'])],
            'count absurd' => [self::mesh(['textures' => 10 ** 15])],
            'area negative' => [self::mesh(['area' => -1])],
            'area a string' => [self::mesh(['area' => 'big'])],
            'volume infinite' => [self::mesh(['volume' => INF])],
            'watertight a number' => [self::mesh(['watertight' => 1])],
            'watertight a string' => [self::mesh(['watertight' => 'yes'])],
            'layers a fraction' => [self::mesh(['layers' => 2.5])],
            'print time absurd' => [self::mesh(['printSeconds' => 10 ** 12])],
        ];
    }

    /** @param array<string, mixed> $raw */
    #[\PHPUnit\Framework\Attributes\DataProvider('rejected')]
    public function testNormalizeRejects(array $raw): void
    {
        $this->assertNull(ModelStatsService::normalize($raw));
    }

    /** @return array<string, array{0: mixed}> */
    public static function notObjects(): array
    {
        return [
            'null' => [null],
            'a string' => ['{"v":1}'],
            'a number' => [1],
            'a list' => [[1, 2, 3]],
            'an empty list' => [[]],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('notObjects')]
    public function testNormalizeRejectsWhatIsNotAnObject(mixed $raw): void
    {
        $this->assertNull(ModelStatsService::normalize($raw));
    }

    public function testStoreInsertsTheFirstMeasurementOfAFile(): void
    {
        $this->mapper->method('findByFile')->with(7)->willReturn(null);
        $this->mapper->expects($this->once())->method('insert')->willReturnCallback(function (ModelStat $row): ModelStat {
            $this->assertSame(7, $row->getFileId());
            $this->assertSame('etag-1', $row->getEtag());
            $this->assertSame('alice', $row->getCreatedBy());
            $this->assertSame(1_700_000_000, $row->getCreatedAt());
            $this->assertSame(ModelStatsService::normalize(self::mesh()), ModelStatsService::normalize(json_decode($row->getStats(), true)));

            return $row;
        });

        $this->assertSame(ModelStatsStoreResult::Stored, $this->service->store(7, 'etag-1', self::mesh(), 'alice'));
    }

    public function testStoreStoresTheRebuiltMeasurementNotTheRequest(): void
    {
        $this->mapper->method('findByFile')->willReturn(null);
        $this->mapper->method('insert')->willReturnCallback(function (ModelStat $row): ModelStat {
            $this->assertSame(['v', 'kind', 'size', 'unit', 'up', 'triangles', 'vertices', 'points', 'splats', 'parts', 'materials', 'textures', 'area', 'volume', 'watertight', 'layers', 'printSeconds'], array_keys(json_decode($row->getStats(), true)));

            return $row;
        });

        $this->service->store(7, 'e', self::mesh(['size' => [1.0, 2.0, 3.0]]), 'alice');
    }

    public function testTheFirstMeasurementOfAVersionIsKept(): void
    {
        $this->mapper->method('findByFile')->willReturn($this->row('etag-1'));
        $this->mapper->expects($this->never())->method('insert');
        $this->mapper->expects($this->never())->method('update');

        $this->assertSame(ModelStatsStoreResult::Exists, $this->service->store(7, 'etag-1', self::mesh(['triangles' => 99]), 'bob'));
    }

    public function testANewerVersionReplacesTheNumbersOfAnEarlierOne(): void
    {
        $old = $this->row('etag-1');
        $this->mapper->method('findByFile')->willReturn($old);
        $this->mapper->expects($this->never())->method('insert');
        $this->mapper->expects($this->once())->method('update')->willReturnCallback(function (ModelStat $row): ModelStat {
            $this->assertSame('etag-2', $row->getEtag());
            $this->assertSame(99, json_decode($row->getStats(), true)['triangles']);

            return $row;
        });

        $this->assertSame(ModelStatsStoreResult::Stored, $this->service->store(7, 'etag-2', self::mesh(['triangles' => 99]), 'bob'));
    }

    public function testAnInvalidMeasurementIsNeverWritten(): void
    {
        $this->mapper->expects($this->never())->method('findByFile');
        $this->mapper->expects($this->never())->method('insert');
        $this->mapper->expects($this->never())->method('update');

        $this->assertSame(ModelStatsStoreResult::Invalid, $this->service->store(7, 'etag-1', self::mesh(['kind' => 'nope']), 'alice'));
        $this->assertSame(ModelStatsStoreResult::Invalid, $this->service->store(7, 'etag-1', 'x', 'alice'));
        $this->assertSame(ModelStatsStoreResult::Invalid, $this->service->store(7, '', self::mesh(), 'alice'));
        $this->assertSame(ModelStatsStoreResult::Invalid, $this->service->store(7, str_repeat('e', 129), self::mesh(), 'alice'));
    }

    public function testARaceForTheFirstWriteLeavesTheWinnersNumbers(): void
    {
        $this->mapper->expects($this->exactly(2))->method('findByFile')->willReturnOnConsecutiveCalls(null, $this->row('etag-1'));
        $this->mapper->method('insert')->willThrowException($this->violation(Exception::REASON_UNIQUE_CONSTRAINT_VIOLATION));
        $this->mapper->expects($this->never())->method('update');

        $this->assertSame(ModelStatsStoreResult::Exists, $this->service->store(7, 'etag-1', self::mesh(), 'alice'));
    }

    public function testARaceWithAnEarlierVersionsRowReplacesIt(): void
    {
        $this->mapper->expects($this->exactly(2))->method('findByFile')->willReturnOnConsecutiveCalls(null, $this->row('etag-0'));
        $this->mapper->method('insert')->willThrowException($this->violation(Exception::REASON_UNIQUE_CONSTRAINT_VIOLATION));
        $this->mapper->expects($this->once())->method('update')->willReturnArgument(0);

        $this->assertSame(ModelStatsStoreResult::Stored, $this->service->store(7, 'etag-1', self::mesh(), 'alice'));
    }

    public function testADatabaseFailureThatIsNotARaceIsNotHidden(): void
    {
        $this->mapper->method('findByFile')->willReturn(null);
        $this->mapper->method('insert')->willThrowException($this->violation(Exception::REASON_CONNECTION_LOST));

        $this->expectException(Exception::class);
        $this->service->store(7, 'etag-1', self::mesh(), 'alice');
    }

    public function testGetReturnsTheNumbersOfThatVersionOnly(): void
    {
        $this->mapper->method('findByFile')->willReturn($this->row('etag-1'));

        $this->assertSame(ModelStatsService::normalize(self::mesh()), $this->service->get(7, 'etag-1'));
        $this->assertNull($this->service->get(7, 'etag-2'), 'a stale version never reads back');
        $this->assertNull($this->service->get(7, ''));
    }

    public function testGetIsNullForAFileThatWasNeverMeasured(): void
    {
        $this->mapper->method('findByFile')->willReturn(null);

        $this->assertNull($this->service->get(7, 'etag-1'));
    }

    public function testGetDoesNotTrustWhatIsStored(): void
    {
        $row = $this->row('etag-1');
        $row->setStats('{"v":1,"kind":"mesh","size":[1,2,3],"unit":{"mm":1,"changeable":true},"triangles":-5}');
        $this->mapper->method('findByFile')->willReturn($row);
        $this->assertNull($this->service->get(7, 'etag-1'), 'a row that no longer passes the gate is not shown');

        $row->setStats('not json');
        $this->assertNull($this->service->get(7, 'etag-1'));
    }

    public function testMeasuredNamesTheFilesWhoseCurrentVersionHasNumbers(): void
    {
        $this->mapper->method('findEtags')->with([1, 2, 3])->willReturn([1 => 'a', 2 => 'old', 9 => 'z']);

        $this->assertSame([1], $this->service->measured([1 => 'a', 2 => 'new', 3 => 'c']));
        $this->assertSame([], $this->service->measured([]));
    }

    public function testDeleteDropsTheRow(): void
    {
        $this->mapper->expects($this->once())->method('deleteByFile')->with(7);

        $this->service->delete(7);
    }
}
