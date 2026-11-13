<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Reference;

use OCA\ThreeDViewer\Constants\SupportedFormats;
use OCA\ThreeDViewer\Reference\ModelReferenceProvider;
use OCA\ThreeDViewer\Service\FileSettingsService;
use OCA\ThreeDViewer\Service\ThumbnailService;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\IUser;
use OCP\IUserSession;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * Which links become a 3D model card, and what a card may say to whom.
 *
 * Two things can go wrong here and neither shows in a demo. A provider that claims too much
 * answers for links that are not its own, and Nextcloud never falls through to the next
 * provider once one has matched. A provider that is careless about the reader shows one
 * user the name and thumbnail of a file only another may open.
 */
class ModelReferenceProviderTest extends TestCase
{
    private const HOST = 'https://cloud.example.com';

    private IUserSession&MockObject $session;
    private IRootFolder&MockObject $rootFolder;
    private ThumbnailService&MockObject $thumbnails;
    private FileSettingsService&MockObject $fileSettings;
    private LoggerInterface&MockObject $logger;
    private ?string $uid = 'alice';

    protected function setUp(): void
    {
        $this->session = $this->createMock(IUserSession::class);
        $this->session->method('getUser')->willReturnCallback(function (): ?IUser {
            if ($this->uid === null) {
                return null;
            }
            $user = $this->createMock(IUser::class);
            $user->method('getUID')->willReturn($this->uid);

            return $user;
        });
        $this->rootFolder = $this->createMock(IRootFolder::class);
        $this->thumbnails = $this->createMock(ThumbnailService::class);
        $this->fileSettings = $this->createMock(FileSettingsService::class);
        $this->fileSettings->method('settings')->willReturn(['unit' => null, 'up' => null]);
        $this->logger = $this->createMock(LoggerInterface::class);
    }

    private function provider(string $base = self::HOST): ModelReferenceProvider
    {
        $urls = $this->createMock(IURLGenerator::class);
        // What the server does: the absolute URL is the base (host and web root) plus the path
        $urls->method('getAbsoluteURL')->willReturnCallback(static fn (string $path): string => $base . $path);
        $urls->method('imagePath')->willReturnCallback(static fn (string $app, string $image): string => "/apps/$app/img/$image");
        $urls->method('linkToRouteAbsolute')->willReturnCallback(
            static fn (string $route, array $params): string => $base . '/index.php/' . $route . '?' . http_build_query($params)
        );
        $l10n = $this->createMock(IL10N::class);
        $l10n->method('t')->willReturnCallback(static fn (string $text, array $params = []): string => vsprintf($text, $params));

        return new class ($urls, $this->rootFolder, $this->session, $this->thumbnails, $this->fileSettings, $l10n, $this->logger) extends ModelReferenceProvider {
            protected function humanSize(int $bytes): string
            {
                return $bytes . ' B';
            }
        };
    }

    // --- Which links match -------------------------------------------------------

    /** @return array<string, array{string, int}> */
    public static function ownLinks(): array
    {
        return [
            'viewer page' => [self::HOST . '/apps/threedviewer/f/123', 123],
            'viewer page through index.php' => [self::HOST . '/index.php/apps/threedviewer/f/123', 123],
            'a view link' => [self::HOST . '/apps/threedviewer/f/42?view=1.eyJjIjp7fX0', 42],
            'a view link through index.php' => [self::HOST . '/index.php/apps/threedviewer/f/42?view=1.eyJjIjp7fX0', 42],
            'an older camera link' => [self::HOST . '/apps/threedviewer/f/42?cam=1,2,3', 42],
            'the folder the viewer was opened from' => [self::HOST . '/apps/threedviewer/f/42?dir=%2FModels%2FCars', 42],
            'a view and a folder' => [self::HOST . '/apps/threedviewer/f/42?dir=%2Fa&view=1.abc', 42],
            'a fragment' => [self::HOST . '/apps/threedviewer/f/42#top', 42],
            'a query that is only a question mark' => [self::HOST . '/apps/threedviewer/f/42?', 42],
            'the largest id that always fits' => [self::HOST . '/apps/threedviewer/f/999999999999999999', 999999999999999999],
        ];
    }

    /** @dataProvider ownLinks */
    public function testTheAppsOwnViewerLinksMatch(string $link, int $fileId): void
    {
        $provider = $this->provider();

        $this->assertTrue($provider->matchReference($link));
        $this->assertSame((string) $fileId, $provider->getCachePrefix($link));
    }

    public function testAServerInASubfolderMatchesWithItsWebRoot(): void
    {
        $provider = $this->provider(self::HOST . '/nextcloud');

        $this->assertTrue($provider->matchReference(self::HOST . '/nextcloud/apps/threedviewer/f/7'));
        $this->assertTrue($provider->matchReference(self::HOST . '/nextcloud/index.php/apps/threedviewer/f/7?view=1.abc'));
        $this->assertSame('7', $provider->getCachePrefix(self::HOST . '/nextcloud/apps/threedviewer/f/7'));
        // A link that leaves the web root out is not to this server's viewer
        $this->assertFalse($provider->matchReference(self::HOST . '/apps/threedviewer/f/7'));
    }

    /** @return array<string, array{string}> */
    public static function otherLinks(): array
    {
        return [
            // Core's Files provider answers for these, for every file type, so this one must not
            'a Files link' => [self::HOST . '/f/123'],
            'a Files link through index.php' => [self::HOST . '/index.php/f/123'],
            'the Files app on a file' => [self::HOST . '/apps/files/?fileid=123'],
            'the Files app opening a file' => [self::HOST . '/apps/files/?dir=/&openfile=123'],
            'a public share' => [self::HOST . '/s/AbCdEf123456'],
            'a public share with a file' => [self::HOST . '/s/AbCdEf123456?path=%2F&files=a.glb'],
            'an embed page' => [self::HOST . '/apps/threedviewer/embed/AbCdEf123456'],
            'the viewer without a file' => [self::HOST . '/apps/threedviewer/'],
            'the file route without an id' => [self::HOST . '/apps/threedviewer/f/'],
            'an id that is not a number' => [self::HOST . '/apps/threedviewer/f/abc'],
            'an id with trailing letters' => [self::HOST . '/apps/threedviewer/f/12abc'],
            'zero' => [self::HOST . '/apps/threedviewer/f/0'],
            'an id with leading zeros' => [self::HOST . '/apps/threedviewer/f/012'],
            'a negative id' => [self::HOST . '/apps/threedviewer/f/-1'],
            'a decimal id' => [self::HOST . '/apps/threedviewer/f/1.5'],
            'an id too long for an integer' => [self::HOST . '/apps/threedviewer/f/99999999999999999999'],
            'more path after the id' => [self::HOST . '/apps/threedviewer/f/12/extra'],
            'a trailing slash' => [self::HOST . '/apps/threedviewer/f/12/'],
            'a lookalike route' => [self::HOST . '/apps/threedviewer/file/12'],
            'another app with the same route' => [self::HOST . '/apps/other/f/12'],
            'another host' => ['https://other.example.org/apps/threedviewer/f/12'],
            'another scheme' => ['http://cloud.example.com/apps/threedviewer/f/12'],
            'a host that only starts like this one' => ['https://cloud.example.com.evil.example/apps/threedviewer/f/12'],
            'credentials that put another host after this one' => ['https://cloud.example.com@evil.example/apps/threedviewer/f/12'],
            'the route inside another address' => ['https://evil.example/?u=' . self::HOST . '/apps/threedviewer/f/12'],
            'a link in the middle of text' => ['see ' . self::HOST . '/apps/threedviewer/f/12'],
            'whitespace after the id' => [self::HOST . '/apps/threedviewer/f/12 now'],
            'a newline after the id' => [self::HOST . "/apps/threedviewer/f/12\n"],
            'nothing' => [''],
            'plain text' => ['hello'],
        ];
    }

    /** @dataProvider otherLinks */
    public function testOtherLinksDoNotMatch(string $link): void
    {
        $provider = $this->provider();

        $this->assertFalse($provider->matchReference($link));
        $this->assertSame('', $provider->getCachePrefix($link));
        // Not matching also means never reading a file for the link
        $this->rootFolder->expects($this->never())->method('getUserFolder');
        $this->assertNull($provider->resolveReference($link));
    }

    // --- Who may see a card ----------------------------------------------------------

    private function file(string $name = 'part.glb', int $id = 123, bool $readable = true): File&MockObject
    {
        $file = $this->createMock(File::class);
        $file->method('getId')->willReturn($id);
        $file->method('getName')->willReturn($name);
        $file->method('getExtension')->willReturn(pathinfo($name, PATHINFO_EXTENSION));
        $file->method('getSize')->willReturn(2048);
        $file->method('getEtag')->willReturn('etag-1');
        $file->method('isReadable')->willReturn($readable);

        return $file;
    }

    /** What each user's own file tree holds: the file for those named, nothing for anyone else. */
    private function filesVisibleTo(array $byUser): void
    {
        $this->rootFolder->method('getUserFolder')->willReturnCallback(function (string $uid) use ($byUser): Folder {
            $home = $this->createMock(Folder::class);
            $home->method('getFirstNodeById')->willReturn($byUser[$uid] ?? null);

            return $home;
        });
    }

    public function testAUserWhoCanOpenTheModelGetsACard(): void
    {
        $this->filesVisibleTo(['alice' => $this->file('Engine block.STL', 123)]);
        $link = self::HOST . '/apps/threedviewer/f/123';

        $reference = $this->provider()->resolveReference($link);

        $this->assertNotNull($reference);
        $this->assertSame('Engine block.STL', $reference->getTitle());
        $this->assertSame('STL · 2048 B', $reference->getDescription());
        $this->assertSame($link, $reference->getUrl());
        $this->assertSame('threedviewer_model', $reference->getRichObjectType());
        $rich = $reference->getRichObject();
        $this->assertSame(123, $rich['id']);
        $this->assertSame('Engine block.STL', $rich['name']);
        $this->assertSame('STL', $rich['format']);
        $this->assertSame(2048, $rich['size']);
        $this->assertSame('STL · 2048 B', $rich['description']);
        $this->assertSame($link, $rich['link']);
        $this->assertFalse($rich['hasView']);
    }

    public function testAUserWithoutAccessGetsNothingAtAll(): void
    {
        // Bob has no such file in his tree: not shared with him, or not there. Alice does.
        $this->filesVisibleTo(['alice' => $this->file('secret-prototype.glb', 123)]);
        $this->uid = 'bob';

        $reference = $this->provider()->resolveReference(self::HOST . '/apps/threedviewer/f/123');

        // Not a card with a blank name, not a flag: nothing a client could tell "not yours" from
        // "no such file" by, and nothing for the cache to keep.
        $this->assertNull($reference);
    }

    public function testNothingAboutAFileIsLookedUpForAReaderWhoCannotOpenIt(): void
    {
        $this->filesVisibleTo([]);
        $this->uid = 'bob';
        $this->thumbnails->expects($this->never())->method('has');
        $this->fileSettings->expects($this->never())->method('settings');

        $this->assertNull($this->provider()->resolveReference(self::HOST . '/apps/threedviewer/f/123'));
    }

    public function testTheFileIsLookedUpInTheReadersOwnFiles(): void
    {
        $this->rootFolder->expects($this->once())->method('getUserFolder')->with('alice')
            ->willReturn($this->createMock(Folder::class));

        $this->provider()->resolveReference(self::HOST . '/apps/threedviewer/f/123');
    }

    public function testAReaderWhoIsNotSignedInGetsNothing(): void
    {
        $this->uid = null;
        $this->rootFolder->expects($this->never())->method('getUserFolder');

        $this->assertNull($this->provider()->resolveReference(self::HOST . '/apps/threedviewer/f/123'));
    }

    public function testAFileTheReaderMayNotReadGetsNothing(): void
    {
        // A file-drop share puts a file in the tree without the right to read it
        $this->filesVisibleTo(['alice' => $this->file('part.glb', 123, false)]);

        $this->assertNull($this->provider()->resolveReference(self::HOST . '/apps/threedviewer/f/123'));
    }

    public function testAFolderGetsNothing(): void
    {
        $this->filesVisibleTo(['alice' => $this->createMock(Folder::class)]);

        $this->assertNull($this->provider()->resolveReference(self::HOST . '/apps/threedviewer/f/123'));
    }

    /** @return array<string, array{string}> */
    public static function notModels(): array
    {
        return [
            'a text file' => ['notes.txt'],
            'a PDF' => ['report.pdf'],
            'a material file, which is a companion of a model' => ['part.mtl'],
            'a texture' => ['skin.png'],
            'no extension' => ['README'],
        ];
    }

    /** @dataProvider notModels */
    public function testAFileThatIsNotAModelGetsNothing(string $name): void
    {
        // Another provider would have been the one to answer; nothing may be said about the file
        $this->filesVisibleTo(['alice' => $this->file($name, 123)]);
        $this->thumbnails->expects($this->never())->method('has');

        $this->assertNull($this->provider()->resolveReference(self::HOST . '/apps/threedviewer/f/123'));
    }

    public function testEveryModelFormatGetsACard(): void
    {
        foreach (SupportedFormats::getModelExtensions() as $extension) {
            $this->rootFolder = $this->createMock(IRootFolder::class);
            $this->filesVisibleTo(['alice' => $this->file("part.$extension", 5)]);
            $provider = $this->provider();

            $this->assertNotNull($provider->resolveReference(self::HOST . '/apps/threedviewer/f/5'), $extension);
        }
    }

    public function testAFailureLeavesTheBareLinkAndSaysSo(): void
    {
        $this->rootFolder->method('getUserFolder')->willThrowException(new \RuntimeException('storage offline'));
        $this->logger->expects($this->once())->method('warning');

        $this->assertNull($this->provider()->resolveReference(self::HOST . '/apps/threedviewer/f/123'));
    }

    // --- What a card says --------------------------------------------------------

    public function testTheUnitSomeoneSetForTheFileIsPartOfTheDescription(): void
    {
        $this->fileSettings = $this->createMock(FileSettingsService::class);
        $this->fileSettings->method('settings')->with(123)->willReturn(['unit' => 'mm', 'up' => null]);
        $this->filesVisibleTo(['alice' => $this->file('part.stl', 123)]);

        $reference = $this->provider()->resolveReference(self::HOST . '/apps/threedviewer/f/123');

        $this->assertSame('STL · 2048 B · Units: mm', $reference->getDescription());
        $this->assertSame('mm', $reference->getRichObject()['unit']);
    }

    public function testAnUnreadableUnitIsLeftOutRatherThanFailingTheCard(): void
    {
        $this->fileSettings = $this->createMock(FileSettingsService::class);
        $this->fileSettings->method('settings')->willThrowException(new \RuntimeException('db down'));
        $this->filesVisibleTo(['alice' => $this->file('part.stl', 123)]);

        $reference = $this->provider()->resolveReference(self::HOST . '/apps/threedviewer/f/123');

        $this->assertSame('STL · 2048 B', $reference->getDescription());
        $this->assertNull($reference->getRichObject()['unit']);
    }

    public function testTheThumbnailIsNextcloudsPreviewOfTheFileOnceOneIsStored(): void
    {
        $this->thumbnails->method('has')->with(123, 'etag-1')->willReturn(true);
        $this->filesVisibleTo(['alice' => $this->file('part.glb', 123)]);

        $reference = $this->provider()->resolveReference(self::HOST . '/apps/threedviewer/f/123');

        $thumbnail = $reference->getImageUrl();
        $this->assertStringContainsString('core.Preview.getPreviewByFileId', (string) $thumbnail);
        $this->assertStringContainsString('fileId=123', (string) $thumbnail);
        $this->assertSame($thumbnail, $reference->getRichObject()['thumbnail']);
    }

    public function testWithoutAThumbnailTheCardHasNoImage(): void
    {
        // The preview would be a file-type icon, which the card draws for itself
        $this->thumbnails->method('has')->willReturn(false);
        $this->filesVisibleTo(['alice' => $this->file('part.glb', 123)]);

        $reference = $this->provider()->resolveReference(self::HOST . '/apps/threedviewer/f/123');

        $this->assertNull($reference->getImageUrl());
        $this->assertNull($reference->getRichObject()['thumbnail']);
    }

    public function testAThumbnailLookupIsForTheVersionTheReaderSees(): void
    {
        $this->thumbnails->expects($this->once())->method('has')->with(123, 'etag-1')->willReturn(false);
        $this->filesVisibleTo(['alice' => $this->file('part.glb', 123)]);

        $this->provider()->resolveReference(self::HOST . '/apps/threedviewer/f/123');
    }

    /** @return array<string, array{string, bool}> */
    public static function viewLinks(): array
    {
        return [
            'a plain link' => [self::HOST . '/apps/threedviewer/f/123', false],
            'a folder only' => [self::HOST . '/apps/threedviewer/f/123?dir=%2Fa', false],
            'a view link' => [self::HOST . '/apps/threedviewer/f/123?view=1.eyJjIjp7fX0', true],
            'a view link after a folder' => [self::HOST . '/apps/threedviewer/f/123?dir=%2Fa&view=1.abc', true],
            'an older camera link' => [self::HOST . '/apps/threedviewer/f/123?cam=1,2,3', true],
            'a view link through index.php' => [self::HOST . '/index.php/apps/threedviewer/f/123?view=1.abc', true],
        ];
    }

    /** @dataProvider viewLinks */
    public function testTheCardSaysWhetherTheLinkOpensASavedView(string $link, bool $hasView): void
    {
        $this->filesVisibleTo(['alice' => $this->file('part.glb', 123)]);

        $reference = $this->provider()->resolveReference($link);

        // The link the card opens is the one that was pasted, so the view survives
        $this->assertSame($link, $reference->getUrl());
        $this->assertSame($link, $reference->getRichObject()['link']);
        $this->assertSame($hasView, $reference->getRichObject()['hasView']);
    }

    // --- The cache -------------------------------------------------------------------

    public function testCardsAreCachedPerReader(): void
    {
        $link = self::HOST . '/apps/threedviewer/f/123';

        $this->uid = 'alice';
        $forAlice = $this->provider()->getCacheKey($link);
        $this->uid = 'bob';
        $forBob = $this->provider()->getCacheKey($link);
        $this->uid = null;
        $forNobody = $this->provider()->getCacheKey($link);

        // Alice's card must never be what Bob is handed from the cache
        $this->assertNotSame($forAlice, $forBob);
        $this->assertNotSame($forAlice, $forNobody);
        $this->assertNotSame($forBob, $forNobody);
    }

    public function testEachLinkToAFileIsCachedOnItsOwn(): void
    {
        $this->uid = 'alice';
        $plain = $this->provider()->getCacheKey(self::HOST . '/apps/threedviewer/f/123');
        $withView = $this->provider()->getCacheKey(self::HOST . '/apps/threedviewer/f/123?view=1.abc');

        // A card for the plain link must not open the saved view, nor the other way round
        $this->assertNotSame($plain, $withView);
    }

    public function testACardIsNeverCachedWhereCoreKeepsItsFilesCard(): void
    {
        // Core's Files provider caches under the same prefix (the file id) with the user id
        // as the key; the manager would hand one provider's card to the other's link.
        $this->uid = 'alice';
        $this->assertNotSame('alice', $this->provider()->getCacheKey(self::HOST . '/apps/threedviewer/f/123'));
    }

    public function testCardsAreCachedUnderTheFileIdSoCoreCanDropThem(): void
    {
        // Core clears `(string) $fileId` when a file is deleted, renamed or shared
        $this->assertSame('123', $this->provider()->getCachePrefix(self::HOST . '/apps/threedviewer/f/123?view=1.abc'));
        $this->assertSame('123', ModelReferenceProvider::cachePrefixFor(123));
    }

    // --- What it offers the Smart Picker -----------------------------------------------

    public function testItIsOfferedInTheSmartPickerWithAModelSearch(): void
    {
        $provider = $this->provider();

        $this->assertSame('threedviewer', $provider->getId());
        $this->assertSame('3D models', $provider->getTitle());
        $this->assertSame('/apps/threedviewer/img/app-dark.svg', $provider->getIconUrl());
        $this->assertSame(['threedviewer-models'], $provider->getSupportedSearchProviderIds());
        $this->assertSame(
            ['id' => 'threedviewer', 'title' => '3D models', 'icon_url' => '/apps/threedviewer/img/app-dark.svg', 'order' => 20, 'search_providers_ids' => ['threedviewer-models']],
            $provider->jsonSerialize(),
        );
    }
}
