<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Search;

use OCA\ThreeDViewer\Search\ModelSearchProvider;
use OCA\ThreeDViewer\Service\ThumbnailService;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IMimeTypeDetector;
use OCP\Files\IRootFolder;
use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\IUser;
use OCP\Search\ISearchQuery;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The Smart Picker's "3D models" search: models the user may open, found by name, each
 * answering with the viewer link that a pick inserts.
 */
class ModelSearchProviderTest extends TestCase
{
    private Folder&MockObject $home;
    private ThumbnailService&MockObject $thumbnails;
    private LoggerInterface&MockObject $logger;
    private ModelSearchProvider $provider;

    protected function setUp(): void
    {
        $this->home = $this->createMock(Folder::class);
        $this->home->method('getRelativePath')->willReturnCallback(static fn (string $p): string => preg_replace('#^/alice/files#', '', $p));
        $rootFolder = $this->createMock(IRootFolder::class);
        $rootFolder->method('getUserFolder')->willReturnCallback(fn (string $uid): Folder => $uid === 'alice' ? $this->home : $this->createMock(Folder::class));

        $urls = $this->createMock(IURLGenerator::class);
        $urls->method('linkToRouteAbsolute')->willReturnCallback(
            static fn (string $route, array $params): string => 'https://cloud.example.com/' . $route . '?' . http_build_query($params)
        );
        $mimes = $this->createMock(IMimeTypeDetector::class);
        $mimes->method('mimeTypeIcon')->willReturnCallback(static fn (string $mime): string => '/icons/' . str_replace('/', '-', $mime) . '.svg');
        $this->thumbnails = $this->createMock(ThumbnailService::class);
        $l10n = $this->createMock(IL10N::class);
        $l10n->method('t')->willReturnArgument(0);
        $this->logger = $this->createMock(LoggerInterface::class);

        $this->provider = new ModelSearchProvider($rootFolder, $urls, $mimes, $this->thumbnails, $l10n, $this->logger);
    }

    private function user(string $uid = 'alice'): IUser
    {
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn($uid);

        return $user;
    }

    private function query(string $term, int $limit = 5, int|string|null $cursor = null): ISearchQuery
    {
        $query = $this->createMock(ISearchQuery::class);
        $query->method('getTerm')->willReturn($term);
        $query->method('getLimit')->willReturn($limit);
        $query->method('getCursor')->willReturn($cursor);

        return $query;
    }

    private function file(string $name, int $id, int $mtime = 100, bool $readable = true, string $dir = '/models'): File&MockObject
    {
        $file = $this->createMock(File::class);
        $file->method('getId')->willReturn($id);
        $file->method('getName')->willReturn($name);
        $file->method('getExtension')->willReturn(pathinfo($name, PATHINFO_EXTENSION));
        $file->method('getMimeType')->willReturn('model/stl');
        $file->method('getEtag')->willReturn("etag-$id");
        $file->method('getMTime')->willReturn($mtime);
        $file->method('isReadable')->willReturn($readable);
        $file->method('getPath')->willReturn("/alice/files$dir/$name");

        return $file;
    }

    public function testItIsFoundByTheSmartPickerThroughItsId(): void
    {
        $this->assertSame('threedviewer-models', $this->provider->getId());
        $this->assertSame('3D models', $this->provider->getName());
    }

    public function testItIsNotListedInTheSearchBarWhereFilesFindsModelsAlready(): void
    {
        $this->assertNull($this->provider->getOrder('files.view.index', []));
    }

    public function testAHitAnswersWithTheViewerLinkAndWhereTheFileIs(): void
    {
        $this->home->method('search')->with('engine')->willReturn([$this->file('Engine.stl', 31, 100, true, '/Cars')]);

        $result = $this->provider->search($this->user(), $this->query('engine'))->jsonSerialize();

        $this->assertFalse($result['isPaginated']);
        $this->assertCount(1, $result['entries']);
        $entry = $result['entries'][0]->jsonSerialize();
        $this->assertSame('Engine.stl', $entry['title']);
        $this->assertSame('STL · /Cars', $entry['subline']);
        $this->assertSame('https://cloud.example.com/threedviewer.page.viewer?fileId=31', $entry['resourceUrl']);
    }

    public function testAModelWithoutAThumbnailShowsItsFileTypeIcon(): void
    {
        $this->thumbnails->method('has')->willReturn(false);
        $this->home->method('search')->willReturn([$this->file('a.stl', 1)]);

        $entry = $this->provider->search($this->user(), $this->query('a.'))->jsonSerialize()['entries'][0]->jsonSerialize();

        $this->assertSame('/icons/model-stl.svg', $entry['thumbnailUrl']);
    }

    public function testAModelWithAThumbnailShowsIt(): void
    {
        $this->thumbnails->method('has')->with(1, 'etag-1')->willReturn(true);
        $this->home->method('search')->willReturn([$this->file('a.stl', 1)]);

        $entry = $this->provider->search($this->user(), $this->query('a.'))->jsonSerialize()['entries'][0]->jsonSerialize();

        $this->assertStringContainsString('core.Preview.getPreviewByFileId?fileId=1', $entry['thumbnailUrl']);
    }

    public function testOnlyModelsTheUserMayReadAreListed(): void
    {
        $folder = $this->createMock(Folder::class);
        $this->home->method('search')->willReturn([
            $this->file('notes.stl.txt', 1),
            $this->file('part.mtl', 2),
            $this->file('drop-only.glb', 3, 100, false),
            $folder,
            $this->file('good.glb', 4),
        ]);

        $entries = $this->provider->search($this->user(), $this->query('part'))->jsonSerialize()['entries'];

        $this->assertSame(['good.glb'], array_map(static fn ($e): string => $e->jsonSerialize()['title'], $entries));
    }

    public function testTheSearchRunsInTheAskingUsersOwnFiles(): void
    {
        $this->home->expects($this->never())->method('search');

        // Bob's tree is not Alice's: the search goes to his folder, which holds nothing here
        $result = $this->provider->search($this->user('bob'), $this->query('engine'))->jsonSerialize();

        $this->assertSame([], $result['entries']);
    }

    public function testTheMostRecentlyChangedModelComesFirst(): void
    {
        $this->home->method('search')->willReturn([
            $this->file('old.stl', 1, 100),
            $this->file('new.stl', 2, 300),
            $this->file('mid.stl', 3, 200),
        ]);

        $entries = $this->provider->search($this->user(), $this->query('stl'))->jsonSerialize()['entries'];

        $this->assertSame(['new.stl', 'mid.stl', 'old.stl'], array_map(static fn ($e): string => $e->jsonSerialize()['title'], $entries));
    }

    public function testResultsArePagedByTheCursor(): void
    {
        $this->home->method('search')->willReturn([
            $this->file('a.stl', 1, 500),
            $this->file('b.stl', 2, 400),
            $this->file('c.stl', 3, 300),
            $this->file('d.stl', 4, 200),
            $this->file('e.stl', 5, 100),
        ]);

        $first = $this->provider->search($this->user(), $this->query('stl', 2))->jsonSerialize();
        $second = $this->provider->search($this->user(), $this->query('stl', 2, $first['cursor']))->jsonSerialize();
        $third = $this->provider->search($this->user(), $this->query('stl', 2, $second['cursor']))->jsonSerialize();

        $titles = static fn (array $page): array => array_map(static fn ($e): string => $e->jsonSerialize()['title'], $page['entries']);
        $this->assertTrue($first['isPaginated']);
        $this->assertSame(['a.stl', 'b.stl'], $titles($first));
        $this->assertSame(['c.stl', 'd.stl'], $titles($second));
        $this->assertSame(['e.stl'], $titles($third));
        $this->assertFalse($third['isPaginated']);
    }

    public function testATermTooShortToMeanAnythingFindsNothing(): void
    {
        $this->home->expects($this->never())->method('search');

        foreach (['', ' ', 'a', ' a '] as $term) {
            $this->assertSame([], $this->provider->search($this->user(), $this->query($term))->jsonSerialize()['entries'], "'$term'");
        }
    }

    public function testASearchThatFailsFindsNothingAndSaysSo(): void
    {
        $this->home->method('search')->willThrowException(new \RuntimeException('storage offline'));
        $this->logger->expects($this->once())->method('warning');

        $this->assertSame([], $this->provider->search($this->user(), $this->query('engine'))->jsonSerialize()['entries']);
    }

    public function testAThumbnailLookupThatFailsFallsBackToTheFileTypeIcon(): void
    {
        $this->thumbnails->method('has')->willThrowException(new \RuntimeException('app data unwritable'));
        $this->home->method('search')->willReturn([$this->file('a.stl', 1)]);

        $entry = $this->provider->search($this->user(), $this->query('a.'))->jsonSerialize()['entries'][0]->jsonSerialize();

        $this->assertSame('/icons/model-stl.svg', $entry['thumbnailUrl']);
    }
}
