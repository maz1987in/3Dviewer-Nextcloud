<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Http;

require_once __DIR__ . '/HttpTestCase.php';

use OCP\Constants;
use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\Server;

/**
 * Link previews of models, through the endpoint Talk, Text and the other apps ask
 * (`/ocs/v2.php/references/resolve`), so the reference manager's matching and caching are
 * the server's own, not a test double's.
 */
class ReferenceHttpTest extends HttpTestCase
{
    private const RESOLVE_URL = '/ocs/v2.php/references/resolve';

    private static function viewerLink(File $file, string $suffix = ''): string
    {
        return self::base() . '/index.php/apps/threedviewer/f/' . $file->getId() . $suffix;
    }

    /**
     * The resolved reference for a link as one user sees it, or null when there is none.
     *
     * @return array<string, mixed>|null
     */
    private function resolve(string $uid, string $link): ?array
    {
        $response = $this->basic($uid)->get(self::RESOLVE_URL, [
            'query' => ['reference' => $link, 'format' => 'json'],
        ]);
        $this->assertSame(200, $response->getStatusCode(), 'the resolve endpoint answered');
        $references = self::json($response)['ocs']['data']['references'] ?? null;
        $this->assertIsArray($references);
        $this->assertArrayHasKey($link, $references);

        return $references[$link];
    }

    public function testTheOwnerGetsACardForAViewerLink(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner, 'bracket.stl');
        $link = self::viewerLink($model);

        $card = $this->resolve($owner, $link);

        $this->assertNotNull($card);
        $this->assertSame('threedviewer_model', $card['richObjectType']);
        $this->assertSame('bracket.stl', $card['richObject']['name']);
        $this->assertSame('STL', $card['richObject']['format']);
        $this->assertSame($link, $card['richObject']['link']);
        $this->assertSame('bracket.stl', $card['openGraphObject']['name']);
    }

    public function testARecipientOfAShareGetsTheCardToo(): void
    {
        $owner = $this->newUser();
        $reader = $this->newUser();
        $model = $this->newModel($owner, 'bracket.stl');
        $this->shareWithUser($model, $owner, $reader, Constants::PERMISSION_READ);

        $card = $this->resolve($reader, self::viewerLink($model));

        $this->assertNotNull($card);
        $this->assertSame('bracket.stl', $card['richObject']['name']);
    }

    public function testSomeoneWhoCannotOpenTheModelLearnsNothing(): void
    {
        $owner = $this->newUser();
        $stranger = $this->newUser();
        $model = $this->newModel($owner, 'secret-prototype.stl');
        $link = self::viewerLink($model);

        // The owner's card is cached first, so a cache shared between readers would show here
        $this->assertNotNull($this->resolve($owner, $link));
        $this->assertNull($this->resolve($stranger, $link));
        $this->assertStringNotContainsString('secret-prototype', (string) $this->basic($stranger)->get(self::RESOLVE_URL, [
            'query' => ['reference' => $link, 'format' => 'json'],
        ])->getBody());
    }

    public function testAFileThatIsNotAModelGetsNoCard(): void
    {
        $owner = $this->newUser();
        $text = Server::get(IRootFolder::class)->getUserFolder($owner)->newFile('notes.txt', 'hello');

        $this->assertNull($this->resolve($owner, self::viewerLink($text)));
    }

    public function testAFilesLinkAndAViewerLinkToOneModelKeepTheirOwnCards(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner, 'bracket.stl');
        $filesLink = self::base() . '/index.php/f/' . $model->getId();

        // Core's Files provider caches under the file id too; whichever is asked first must
        // not be what the other link is answered with.
        $files = $this->resolve($owner, $filesLink);
        $viewer = $this->resolve($owner, self::viewerLink($model));

        $this->assertNotNull($files);
        $this->assertNotSame('threedviewer_model', $files['richObjectType']);
        $this->assertNotNull($viewer);
        $this->assertSame('threedviewer_model', $viewer['richObjectType']);
    }

    public function testAViewLinkKeepsItsViewAndThePlainLinkHasNone(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner, 'bracket.stl');
        $plainLink = self::viewerLink($model);
        $viewLink = self::viewerLink($model, '?view=1.abc');

        $plain = $this->resolve($owner, $plainLink);
        $view = $this->resolve($owner, $viewLink);

        $this->assertFalse($plain['richObject']['hasView']);
        $this->assertSame($plainLink, $plain['richObject']['link']);
        $this->assertTrue($view['richObject']['hasView']);
        $this->assertSame($viewLink, $view['richObject']['link']);
    }
}
