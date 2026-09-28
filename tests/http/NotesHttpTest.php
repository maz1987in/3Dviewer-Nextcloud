<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Http;

require_once __DIR__ . '/HttpTestCase.php';

use GuzzleHttp\Promise\Utils;
use OCA\ThreeDViewer\Db\NoteMapper;
use OCP\Constants;
use OCP\Files\AppData\IAppDataFactory;
use OCP\Files\IAppData;
use OCP\Server;

class NotesHttpTest extends HttpTestCase
{
    public function testEditorCreatesAndARecipientSeesIt(): void
    {
        $owner = $this->newUser();
        $reader = $this->newUser();
        $model = $this->newModel($owner);
        $this->shareWithUser($model, $owner, $reader, Constants::PERMISSION_READ);

        $created = $this->basic($owner)->post(self::notesUrl($model->getId()), ['json' => self::annotation('Hole')]);
        $this->assertSame(201, $created->getStatusCode());

        $seen = self::json($this->basic($reader)->get(self::notesUrl($model->getId())));
        $this->assertFalse($seen['canEdit']);
        $this->assertSame('Hole', $seen['notes'][0]['payload']['text']);
        $this->assertSame($owner, $seen['notes'][0]['author']['uid']);
    }

    public function testReadOnlyRecipientCannotWrite(): void
    {
        $owner = $this->newUser();
        $reader = $this->newUser();
        $model = $this->newModel($owner);
        $this->shareWithUser($model, $owner, $reader, Constants::PERMISSION_READ);
        $noteId = self::json($this->basic($owner)->post(self::notesUrl($model->getId()), ['json' => self::annotation('Keep')]))['id'];

        $client = $this->basic($reader);
        $this->assertSame(403, $client->post(self::notesUrl($model->getId()), ['json' => self::annotation('No')])->getStatusCode());
        $this->assertSame(403, $client->patch(self::notesUrl($model->getId(), $noteId), ['json' => ['payload' => self::annotation('No')['payload']]])->getStatusCode());
        $this->assertSame(403, $client->delete(self::notesUrl($model->getId(), $noteId))->getStatusCode());
        $this->assertSame(1, self::noteCount($model->getId()));
    }

    public function testRecipientWithEditRightsCanEditAnyonesNote(): void
    {
        $owner = $this->newUser();
        $editor = $this->newUser();
        $model = $this->newModel($owner);
        $this->shareWithUser($model, $owner, $editor, Constants::PERMISSION_READ | Constants::PERMISSION_UPDATE);
        $noteId = self::json($this->basic($owner)->post(self::notesUrl($model->getId()), ['json' => self::annotation('Old')]))['id'];

        $response = $this->basic($editor)->patch(self::notesUrl($model->getId(), $noteId), ['json' => ['payload' => self::annotation('New')['payload']]]);

        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame('New', self::json($response)['payload']['text']);
    }

    public function testAStrangerGets404NotForbidden(): void
    {
        $owner = $this->newUser();
        $stranger = $this->newUser();
        $model = $this->newModel($owner);

        $client = $this->basic($stranger);
        $this->assertSame(404, $client->get(self::notesUrl($model->getId()))->getStatusCode());
        $this->assertSame(404, $client->post(self::notesUrl($model->getId()), ['json' => self::annotation('x')])->getStatusCode());
    }

    public function testASessionWriteWithoutTheRequestTokenIsRejected(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        [$client, $token] = $this->session($owner);

        $without = $client->post(self::notesUrl($model->getId()), ['json' => self::annotation('Forged')]);
        $with = $client->post(self::notesUrl($model->getId()), ['json' => self::annotation('Real'), 'headers' => ['requesttoken' => $token]]);

        $this->assertNotSame(201, $without->getStatusCode(), 'CSRF check must reject a token-less write');
        $this->assertSame(201, $with->getStatusCode(), 'the same session with its token is accepted, so the rejection was the token');
        $this->assertSame(1, self::noteCount($model->getId()));
    }

    /** The read migrates private annotations into the shared set, so it needs the token too. */
    public function testASessionReadWithoutTheRequestTokenIsRejected(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        [$client] = $this->session($owner);

        $this->assertNotSame(200, $client->get(self::notesUrl($model->getId()))->getStatusCode());
    }

    public function testAPasswordProtectedLinkWithoutThePasswordReturnsNoNotes(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        $this->basic($owner)->post(self::notesUrl($model->getId()), ['json' => self::annotation('Secret-9f2c')]);
        $token = $this->shareByLink($model, $owner, 'link-password-Aa1!');

        $response = $this->anonymous()->get(self::publicNotesUrl($token, $model->getId()), ['headers' => ['OCS-APIRequest' => 'true']]);

        $this->assertNotSame(200, $response->getStatusCode());
        $this->assertStringNotContainsString('Secret-9f2c', (string) $response->getBody());
    }

    public function testAPublicLinkShowsNotesWithoutAuthors(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        $this->basic($owner)->post(self::notesUrl($model->getId()), ['json' => self::annotation('Visible')]);
        $token = $this->shareByLink($model, $owner);

        $body = self::json($this->anonymous()->get(self::publicNotesUrl($token, $model->getId()), ['headers' => ['OCS-APIRequest' => 'true']]));

        $this->assertFalse($body['canEdit']);
        $this->assertSame('Visible', $body['notes'][0]['payload']['text']);
        $this->assertNull($body['notes'][0]['author']);
        $this->assertStringNotContainsString($owner, json_encode($body));
    }

    public function testNoWriteReachesNotesThroughAPublicLink(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        $token = $this->shareByLink($model, $owner);
        $client = $this->anonymous();
        $url = self::publicNotesUrl($token, $model->getId());
        $headers = ['OCS-APIRequest' => 'true'];

        foreach (['POST', 'PATCH', 'PUT', 'DELETE'] as $method) {
            $status = $client->request($method, $url, ['json' => self::annotation('x'), 'headers' => $headers])->getStatusCode();
            $this->assertGreaterThanOrEqual(400, $status, "$method on the public route must fail");
        }
        $this->assertSame(0, self::noteCount($model->getId()));
    }

    public function testLegacyAnnotationsMoveOnceForAnEditor(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        $this->writeLegacy($owner, $model->getId(), ['A', 'B']);

        $first = self::json($this->basic($owner)->get(self::notesUrl($model->getId())));
        $second = self::json($this->basic($owner)->get(self::notesUrl($model->getId())));

        $this->assertCount(2, $first['notes']);
        $this->assertSame('scene', $first['notes'][0]['payload']['space']);
        $this->assertCount(2, $second['notes'], 'a second open finds nothing left to move');
        $this->assertFalse($this->legacyExists($owner, $model->getId()));
    }

    public function testLegacyAnnotationsStayPrivateForAReadOnlyUser(): void
    {
        $owner = $this->newUser();
        $reader = $this->newUser();
        $model = $this->newModel($owner);
        $this->shareWithUser($model, $owner, $reader, Constants::PERMISSION_READ);
        $this->writeLegacy($reader, $model->getId(), ['Mine']);

        $body = self::json($this->basic($reader)->get(self::notesUrl($model->getId())));

        $this->assertSame([], $body['notes']);
        $this->assertSame('Mine', $body['private'][0]['payload']['text']);
        $this->assertTrue($this->legacyExists($reader, $model->getId()));
        $this->assertSame([], self::json($this->basic($owner)->get(self::notesUrl($model->getId())))['notes'], 'the owner never sees them');
    }

    /** Review focus: two tabs opening the model at once. */
    // php -S serves these one at a time, so this pins "repeated opens migrate once"; the
    // lock that covers truly simultaneous opens is pinned in NotesServiceTest.
    public function testParallelFirstOpensMigrateOnce(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        $this->writeLegacy($owner, $model->getId(), ['A', 'B', 'C']);
        $client = $this->basic($owner);

        Utils::unwrap([
            $client->getAsync(self::notesUrl($model->getId())),
            $client->getAsync(self::notesUrl($model->getId())),
            $client->getAsync(self::notesUrl($model->getId())),
        ]);

        $this->assertSame(3, self::noteCount($model->getId()));
    }

    /** A model in the trash can be restored, so the daily cleanup must leave its notes alone. */
    public function testANoteSurvivesItsModelGoingToTheTrash(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner, 'trashed.stl');
        $fileId = $model->getId();
        $this->assertSame(201, $this->basic($owner)->post(self::notesUrl($fileId), ['json' => self::annotation('Keep')])->getStatusCode());

        $this->assertSame(204, $this->basic($owner)->delete(self::davFileUrl($owner, 'trashed.stl'))->getStatusCode());
        $this->assertSame([$fileId], array_values($this->trash($owner)), 'the server moved the model into the trash');

        Server::get(NoteMapper::class)->deleteOrphans();

        $this->assertSame(1, self::noteCount($fileId));
    }

    public function testANoteIsRemovedOnceItsModelLeavesTheTrash(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner, 'purged.stl');
        $fileId = $model->getId();
        $this->assertSame(201, $this->basic($owner)->post(self::notesUrl($fileId), ['json' => self::annotation('Gone')])->getStatusCode());
        $this->assertSame(204, $this->basic($owner)->delete(self::davFileUrl($owner, 'purged.stl'))->getStatusCode());

        $trash = $this->trash($owner);
        $this->assertSame([$fileId], array_values($trash));
        $this->assertSame(204, $this->basic($owner)->delete(array_key_first($trash))->getStatusCode());
        $this->assertSame([], $this->trash($owner), 'the trash is empty');

        Server::get(NoteMapper::class)->deleteOrphans();

        $this->assertSame(0, self::noteCount($fileId));
    }

    private static function davFileUrl(string $uid, string $name): string
    {
        return '/remote.php/dav/files/' . rawurlencode($uid) . '/' . rawurlencode($name);
    }

    /**
     * The user's trash as the server reports it over WebDAV.
     *
     * @return array<string, int> file id by the item's href
     */
    private function trash(string $uid): array
    {
        $collection = '/remote.php/dav/trashbin/' . rawurlencode($uid) . '/trash';
        $response = $this->basic($uid)->request('PROPFIND', $collection, [
            'headers' => ['Depth' => '1', 'Content-Type' => 'application/xml'],
            'body' => '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:fileid/></d:prop></d:propfind>',
        ]);
        $this->assertSame(207, $response->getStatusCode());

        $xml = new \DOMDocument();
        $xml->loadXML((string) $response->getBody());
        $items = [];
        foreach ($xml->getElementsByTagNameNS('DAV:', 'response') as $entry) {
            $href = $entry->getElementsByTagNameNS('DAV:', 'href')->item(0)?->textContent ?? '';
            if (rtrim(rawurldecode($href), '/') === rtrim(rawurldecode($collection), '/')) {
                continue;
            }
            $items[$href] = (int) $entry->getElementsByTagNameNS('http://owncloud.org/ns', 'fileid')->item(0)?->textContent;
        }

        return $items;
    }

    /** @param list<string> $texts */
    private function writeLegacy(string $uid, int $fileId, array $texts): void
    {
        $annotations = [];
        foreach ($texts as $i => $text) {
            $annotations[] = ['id' => $i, 'point' => ['x' => $i, 'y' => 0, 'z' => 0], 'text' => $text, 'timestamp' => '2026-01-01T00:00:00Z'];
        }
        $appData = $this->appData();

        try {
            $root = $appData->getFolder('annotations');
        } catch (\OCP\Files\NotFoundException) {
            $root = $appData->newFolder('annotations');
        }

        try {
            $folder = $root->getFolder($uid);
        } catch (\OCP\Files\NotFoundException) {
            $folder = $root->newFolder($uid);
        }
        $folder->newFile($fileId . '.json', json_encode(['format' => 'threedviewer-annotations', 'version' => 1, 'annotations' => $annotations]));
    }

    private function legacyExists(string $uid, int $fileId): bool
    {
        try {
            return $this->appData()->getFolder('annotations')->getFolder($uid)->fileExists($fileId . '.json');
        } catch (\OCP\Files\NotFoundException) {
            return false;
        }
    }

    private function appData(): IAppData
    {
        return Server::get(IAppDataFactory::class)->get('threedviewer');
    }
}
