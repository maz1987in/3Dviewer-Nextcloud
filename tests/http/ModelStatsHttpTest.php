<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Http;

require_once __DIR__ . '/HttpTestCase.php';

use OCA\ThreeDViewer\Db\ModelStatMapper;
use OCP\Constants;
use OCP\Files\File;
use OCP\Server;

/**
 * The statistics routes, through the real middleware: who may read a model's numbers, who
 * may store them, the request token on the write, and the version a measurement is kept for.
 */
class ModelStatsHttpTest extends HttpTestCase
{
    private static function url(int $fileId): string
    {
        return '/index.php/apps/threedviewer/api/stats/' . $fileId;
    }

    /** @return array<string, mixed> */
    private static function stats(int $triangles = 12): array
    {
        return [
            'v' => 1,
            'kind' => 'mesh',
            'size' => [120.5, 45.0, 80.0],
            'unit' => ['mm' => 1, 'changeable' => true],
            'triangles' => $triangles,
            'vertices' => 8,
            'parts' => 1,
            'materials' => 1,
            'textures' => 0,
        ];
    }

    /** The file's content, replaced through WebDAV: the server then raises the events and moves the ETag. */
    private function davWrite(string $uid, string $name, string $content): void
    {
        $response = $this->basic($uid)->put('/remote.php/dav/files/' . $uid . '/' . $name, ['body' => $content]);
        $this->assertContains($response->getStatusCode(), [201, 204]);
    }

    private function etag(File $file): string
    {
        return self::json($this->basic($this->owner($file))->get(self::url($file->getId())))['etag'];
    }

    private function owner(File $file): string
    {
        return $file->getOwner()?->getUID() ?? '';
    }

    public function testTheOwnerStoresAndEveryoneWithReadAccessReadsTheNumbers(): void
    {
        $owner = $this->newUser();
        $reader = $this->newUser();
        $model = $this->newModel($owner);
        $this->shareWithUser($model, $owner, $reader, Constants::PERMISSION_READ);
        $etag = $this->etag($model);

        $stored = $this->basic($owner)->post(self::url($model->getId()), ['json' => ['etag' => $etag, 'stats' => self::stats()]]);
        $this->assertSame(201, $stored->getStatusCode());

        $seen = self::json($this->basic($reader)->get(self::url($model->getId())));
        $this->assertSame(12, $seen['stats']['triangles']);
        $this->assertSame(false, $seen['canEdit']);
        $this->assertSame($etag, $seen['etag']);
        $this->assertSame(['count' => 0, 'open' => 0, 'firstId' => null], $seen['notes']);
    }

    public function testAReadOnlyRecipientIsRefusedAndStoresNothing(): void
    {
        $owner = $this->newUser();
        $reader = $this->newUser();
        $model = $this->newModel($owner);
        $this->shareWithUser($model, $owner, $reader, Constants::PERMISSION_READ);
        $etag = $this->etag($model);

        $refused = $this->basic($reader)->post(self::url($model->getId()), ['json' => ['etag' => $etag, 'stats' => self::stats(999)]]);

        $this->assertSame(403, $refused->getStatusCode());
        $this->assertNull(Server::get(ModelStatMapper::class)->findByFile($model->getId()));
        $this->assertNull(self::json($this->basic($owner)->get(self::url($model->getId())))['stats']);
    }

    public function testARecipientWhoCanEditMayStoreTheNumbersOfTheCurrentVersion(): void
    {
        $owner = $this->newUser();
        $editor = $this->newUser();
        $reader = $this->newUser();
        $model = $this->newModel($owner);
        $this->shareWithUser($model, $owner, $editor, Constants::PERMISSION_READ | Constants::PERMISSION_UPDATE);
        $this->shareWithUser($model, $owner, $reader, Constants::PERMISSION_READ);
        $etag = $this->etag($model);

        $stored = $this->basic($editor)->post(self::url($model->getId()), ['json' => ['etag' => $etag, 'stats' => self::stats()]]);

        $this->assertSame(201, $stored->getStatusCode());
        $this->assertSame(12, self::json($this->basic($reader)->get(self::url($model->getId())))['stats']['triangles'], 'a reader sees what an editor stored');
    }

    public function testAStrangerGetsNothingAndStoresNothing(): void
    {
        $owner = $this->newUser();
        $stranger = $this->newUser();
        $model = $this->newModel($owner);
        $etag = $this->etag($model);
        $client = $this->basic($stranger);

        $this->assertSame(404, $client->get(self::url($model->getId()))->getStatusCode());
        $this->assertSame(404, $client->post(self::url($model->getId()), ['json' => ['etag' => $etag, 'stats' => self::stats()]])->getStatusCode());
        $this->assertNull(self::json($this->basic($owner)->get(self::url($model->getId())))['stats']);
    }

    public function testTheSameAnswerForAFileThatDoesNotExist(): void
    {
        $user = $this->newUser();

        $this->assertSame(404, $this->basic($user)->get(self::url(2_000_000_003))->getStatusCode());
    }

    public function testAnonymousVisitorsAreRefused(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);

        $this->assertContains($this->anonymous()->get(self::url($model->getId()))->getStatusCode(), [401, 403, 404, 303]);
    }

    public function testAFileThatIsNotAModelIsNotFound(): void
    {
        $owner = $this->newUser();
        $text = $this->newModel($owner, 'notes.txt');

        $this->assertSame(404, $this->basic($owner)->get(self::url($text->getId()))->getStatusCode());
    }

    public function testNumbersMeasuredFromAnotherVersionAreRefusedWithTheCurrentOnesIntact(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        $current = $this->etag($model);
        $client = $this->basic($owner);

        // The version the browser measured is not the file's current one
        $stale = $client->post(self::url($model->getId()), ['json' => ['etag' => $current . '-older', 'stats' => self::stats()]]);
        $this->assertSame(412, $stale->getStatusCode());
        $this->assertNull(self::json($client->get(self::url($model->getId())))['stats']);
        $this->assertNull(Server::get(ModelStatMapper::class)->findByFile($model->getId()));

        $this->assertSame(201, $client->post(self::url($model->getId()), ['json' => ['etag' => $current, 'stats' => self::stats(24)]])->getStatusCode());
        $this->assertSame(24, self::json($client->get(self::url($model->getId())))['stats']['triangles']);
    }

    public function testWritingTheFileThroughWebDavDropsItsNumbers(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        $client = $this->basic($owner);
        $client->post(self::url($model->getId()), ['json' => ['etag' => $this->etag($model), 'stats' => self::stats()]]);
        $this->assertNotNull(Server::get(ModelStatMapper::class)->findByFile($model->getId()));

        $this->davWrite($owner, 'model.stl', "solid v2\nendsolid v2\n");

        // The server's own listener removed the row, not only the version check hiding it
        $this->assertNull(Server::get(ModelStatMapper::class)->findByFile($model->getId()));
        $this->assertNull(self::json($client->get(self::url($model->getId())))['stats']);
    }

    public function testDeletingTheFileThroughWebDavDropsItsNumbers(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        $id = $model->getId();
        $client = $this->basic($owner);
        $client->post(self::url($id), ['json' => ['etag' => $this->etag($model), 'stats' => self::stats()]]);
        $this->assertNotNull(Server::get(ModelStatMapper::class)->findByFile($id));

        $this->assertSame(204, $client->delete('/remote.php/dav/files/' . $owner . '/model.stl')->getStatusCode());

        $this->assertNull(Server::get(ModelStatMapper::class)->findByFile($id));
    }

    public function testTheFirstMeasurementOfAVersionIsKept(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        $etag = $this->etag($model);
        $client = $this->basic($owner);

        $this->assertSame(201, $client->post(self::url($model->getId()), ['json' => ['etag' => $etag, 'stats' => self::stats(12)]])->getStatusCode());
        $this->assertSame(409, $client->post(self::url($model->getId()), ['json' => ['etag' => $etag, 'stats' => self::stats(99)]])->getStatusCode());
        $this->assertSame(12, self::json($client->get(self::url($model->getId())))['stats']['triangles']);
    }

    public function testNumbersTheServiceRefusesAreNotStored(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        $etag = $this->etag($model);
        $client = $this->basic($owner);

        foreach ([
            ['extra' => 1] + self::stats(),
            ['triangles' => -1] + self::stats(),
            ['size' => [1, 2]] + self::stats(),
            ['kind' => '<script>'] + self::stats(),
        ] as $bad) {
            $this->assertSame(400, $client->post(self::url($model->getId()), ['json' => ['etag' => $etag, 'stats' => $bad]])->getStatusCode());
        }
        $this->assertSame(400, $client->post(self::url($model->getId()), ['json' => ['etag' => $etag, 'stats' => 'x']])->getStatusCode());
        $this->assertSame(400, $client->post(self::url($model->getId()), ['json' => ['etag' => $etag]])->getStatusCode());
        $this->assertNull(self::json($client->get(self::url($model->getId())))['stats']);
    }

    public function testTheWriteNeedsTheRequestToken(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        $etag = $this->etag($model);
        [$browser, $token] = $this->session($owner);

        // A browser session without the token is a forged request
        $forged = $browser->post(self::url($model->getId()), ['json' => ['etag' => $etag, 'stats' => self::stats()]]);
        $this->assertSame(412, $forged->getStatusCode());

        $real = $browser->post(self::url($model->getId()), [
            'headers' => ['requesttoken' => $token],
            'json' => ['etag' => $etag, 'stats' => self::stats()],
        ]);
        $this->assertSame(201, $real->getStatusCode());
    }

    public function testTheNotesAreCountedForTheTab(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        $client = $this->basic($owner);
        $first = self::json($client->post(self::notesUrl($model->getId()), ['json' => self::annotation('one')]));
        $client->post(self::notesUrl($model->getId()), ['json' => self::annotation('two')]);

        $seen = self::json($client->get(self::url($model->getId())));

        $this->assertSame(['count' => 2, 'open' => 2, 'firstId' => $first['id']], $seen['notes']);
    }
}
