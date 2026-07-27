<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Integration;

use OCA\ThreeDViewer\Service\ModelDependencyResolver;
use OCP\Files\IRootFolder;
use OCP\IDBConnection;
use OCP\Server;
use PHPUnit\Framework\TestCase;

/**
 * Proves the suite is running against a real server before any other test claims to.
 *
 * This exists because the previous integration workflow passed while integrating with
 * nothing: it ran the unit suite under another name, against no server, and reported
 * green. A suite that cannot tell the difference between "the server behaved" and "the
 * server was never there" is worse than no suite, because it is quoted as coverage.
 *
 * Every assertion here is one a mock would satisfy trivially and a missing server would
 * not satisfy at all.
 */
class ServerEnvironmentTest extends TestCase
{
    public function testTheServerBootstrapCompleted(): void
    {
        $this->assertTrue(class_exists('OC'), 'Nextcloud was never loaded');
        $this->assertNotSame('', implode('.', \OCP\Util::getVersion()));
    }

    public function testTheContainerHandsBackConcreteImplementations(): void
    {
        $db = Server::get(IDBConnection::class);
        $root = Server::get(IRootFolder::class);

        // A mock would be an anonymous PHPUnit subclass; these are the server's own.
        $this->assertStringStartsWith('OC\\', get_class($db));
        $this->assertStringStartsWith('OC\\', get_class($root));
    }

    /**
     * The exact gap the unit suite cannot cover.
     *
     * `FileIndexMapper` called `escapeLikeParameter()` on the query builder for months.
     * It worked, because the server's concrete builder happens to carry the method — and
     * a mocked `IQueryBuilder` answers any call at all. Only the real pair shows that the
     * method belongs to the connection and the interface never declared it.
     */
    public function testEscapeLikeParameterBelongsToTheConnectionNotTheQueryBuilder(): void
    {
        $db = Server::get(IDBConnection::class);

        $this->assertSame('a\\_b', $db->escapeLikeParameter('a_b'));
        $this->assertFalse(
            method_exists(\OCP\DB\QueryBuilder\IQueryBuilder::class, 'escapeLikeParameter'),
            'IQueryBuilder now declares escapeLikeParameter; calling it on a builder is no longer a bet',
        );
    }

    public function testTheAppIsLoadedAndItsServicesResolve(): void
    {
        $this->assertContains('threedviewer', \OC_App::getEnabledApps());

        $resolver = Server::get(ModelDependencyResolver::class);
        $this->assertInstanceOf(ModelDependencyResolver::class, $resolver);
    }

    public function testTheDatabaseIsReachableAndCarriesTheAppSchema(): void
    {
        $db = Server::get(IDBConnection::class);

        $this->assertTrue(
            $db->tableExists('tv_file_index'),
            'the app migrations have not run against this database',
        );
    }
}
