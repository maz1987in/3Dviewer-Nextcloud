<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Db;

use OCA\ThreeDViewer\Db\FileIndexMapper;
use OCP\DB\IResult;
use OCP\DB\QueryBuilder\IExpressionBuilder;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;
use PHPUnit\Framework\TestCase;

/**
 * getFolders() turns the flat list of indexed folder paths into the immediate
 * children of one parent. folder_path is stored relative to the user's root
 * with no leading slash — "models", "models/textures" — which is what makes the
 * prefix arithmetic below load-bearing.
 */
class FileIndexMapperFolderTest extends TestCase
{
    /**
     * @param string[] $storedFolderPaths
     * @return string[]
     */
    private function foldersFor(array $storedFolderPaths, ?string $parent): array
    {
        $result = $this->createMock(IResult::class);
        $queue = array_map(static fn (string $path) => ['folder_path' => $path], $storedFolderPaths);
        $result->method('fetch')->willReturnCallback(static function () use (&$queue) {
            return array_shift($queue) ?? false;
        });

        $expr = $this->createMock(IExpressionBuilder::class);
        $expr->method('eq')->willReturn('user_id = :user');
        $expr->method('neq')->willReturn('folder_path <> :empty');
        $expr->method('like')->willReturn('folder_path LIKE :prefix');

        $qb = $this->createMock(IQueryBuilder::class);
        $qb->method('selectDistinct')->willReturnSelf();
        $qb->method('from')->willReturnSelf();
        $qb->method('where')->willReturnSelf();
        $qb->method('andWhere')->willReturnSelf();
        $qb->method('orderBy')->willReturnSelf();
        $qb->method('expr')->willReturn($expr);
        $qb->method('createNamedParameter')->willReturn(':p');
        $qb->method('executeQuery')->willReturn($result);

        $db = $this->createMock(IDBConnection::class);
        $db->method('getQueryBuilder')->willReturn($qb);
        $db->method('escapeLikeParameter')->willReturnArgument(0);

        return (new FileIndexMapper($db))->getFolders('alice', $parent);
    }

    public function testListsTopLevelFoldersWhenNoParentIsGiven(): void
    {
        // The default listing. Anything nested must collapse to its first
        // segment, not have its separators removed.
        $this->assertSame(
            ['models', 'projects'],
            $this->foldersFor(['models', 'models/textures', 'projects/cad'], null)
        );
    }

    public function testListsImmediateChildrenOfAParent(): void
    {
        $this->assertSame(
            ['models/textures', 'models/wip'],
            $this->foldersFor(['models/textures', 'models/textures/hi-res', 'models/wip'], 'models')
        );
    }

    public function testHandlesAChildNamedAfterItsParent(): void
    {
        // "models/models" is an ordinary thing to create, and stripping every
        // occurrence of the parent name rather than just the leading one
        // reports it as "models/v2" — a folder that does not exist.
        $this->assertSame(
            ['models/models'],
            $this->foldersFor(['models/models/v2'], 'models')
        );
    }

    public function testHandlesTheParentNameRecurringDeeperInThePath(): void
    {
        $this->assertSame(
            ['a/b'],
            $this->foldersFor(['a/b/a/c'], 'a')
        );
    }

    public function testDeduplicatesChildrenReachedBySeveralDescendants(): void
    {
        $this->assertSame(
            ['models/textures'],
            $this->foldersFor(
                ['models/textures', 'models/textures/hi-res', 'models/textures/hi-res/exr'],
                'models'
            )
        );
    }

    public function testReturnsNothingWhenTheUserHasNoIndexedFolders(): void
    {
        $this->assertSame([], $this->foldersFor([], null));
    }
}
