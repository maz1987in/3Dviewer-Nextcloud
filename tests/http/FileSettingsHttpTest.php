<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Http;

require_once __DIR__ . '/HttpTestCase.php';

use OCP\Constants;
use OCP\Files\IRootFolder;
use OCP\Server;

/**
 * A file's unit, through the real middleware: rights from the file, the request token,
 * and share passwords on public links.
 */
class FileSettingsHttpTest extends HttpTestCase
{
    public function testAnEditorSetsTheUnitAndARecipientSeesIt(): void
    {
        $owner = $this->newUser();
        $reader = $this->newUser();
        $model = $this->newModel($owner);
        $this->shareWithUser($model, $owner, $reader, Constants::PERMISSION_READ);

        $saved = $this->basic($owner)->put(self::settingsUrl($model->getId()), ['json' => ['unit' => 'in']]);
        $this->assertSame(200, $saved->getStatusCode());
        $this->assertSame(['canEdit' => true, 'unit' => 'in', 'up' => null], self::json($saved));

        $this->assertSame(['canEdit' => false, 'unit' => 'in', 'up' => null], self::json($this->basic($reader)->get(self::settingsUrl($model->getId()))));
    }

    public function testAReadOnlyRecipientCannotSetIt(): void
    {
        $owner = $this->newUser();
        $reader = $this->newUser();
        $model = $this->newModel($owner);
        $this->shareWithUser($model, $owner, $reader, Constants::PERMISSION_READ);

        $response = $this->basic($reader)->put(self::settingsUrl($model->getId()), ['json' => ['unit' => 'in']]);

        $this->assertSame(403, $response->getStatusCode());
        $this->assertNull(self::json($this->basic($owner)->get(self::settingsUrl($model->getId())))['unit']);
    }

    public function testARecipientWithEditRightsCanSetIt(): void
    {
        $owner = $this->newUser();
        $editor = $this->newUser();
        $model = $this->newModel($owner);
        $this->shareWithUser($model, $owner, $editor, Constants::PERMISSION_READ | Constants::PERMISSION_UPDATE);

        $this->assertSame(200, $this->basic($editor)->put(self::settingsUrl($model->getId()), ['json' => ['unit' => 'ft']])->getStatusCode());
        $this->assertSame('ft', self::json($this->basic($owner)->get(self::settingsUrl($model->getId())))['unit']);
    }

    public function testAStrangerGets404(): void
    {
        $owner = $this->newUser();
        $stranger = $this->newUser();
        $model = $this->newModel($owner);
        $client = $this->basic($stranger);

        $this->assertSame(404, $client->get(self::settingsUrl($model->getId()))->getStatusCode());
        $this->assertSame(404, $client->put(self::settingsUrl($model->getId()), ['json' => ['unit' => 'in']])->getStatusCode());
    }

    public function testAnUnknownUnitOrAFormatWithItsOwnUnitIs400(): void
    {
        $owner = $this->newUser();
        $stl = $this->newModel($owner);
        $glb = $this->newModel($owner, 'model.glb');
        $client = $this->basic($owner);

        $this->assertSame(400, $client->put(self::settingsUrl($stl->getId()), ['json' => ['unit' => 'furlong']])->getStatusCode());
        $this->assertSame(400, $client->put(self::settingsUrl($glb->getId()), ['json' => ['unit' => 'in']])->getStatusCode());
    }

    public function testClearingTheUnitGoesBackToTheDefault(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        $client = $this->basic($owner);
        $client->put(self::settingsUrl($model->getId()), ['json' => ['unit' => 'in']]);

        $cleared = $client->put(self::settingsUrl($model->getId()), ['json' => ['unit' => null]]);

        $this->assertSame(['canEdit' => true, 'unit' => null, 'up' => null], self::json($cleared));
    }

    public function testASaveWithoutAUnitIsRefusedAndKeepsTheUnit(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        $client = $this->basic($owner);
        $client->put(self::settingsUrl($model->getId()), ['json' => ['unit' => 'in']]);

        $this->assertSame(400, $client->put(self::settingsUrl($model->getId()), ['json' => []])->getStatusCode());
        $this->assertSame('in', self::json($client->get(self::settingsUrl($model->getId())))['unit']);
    }

    public function testAnEditorSetsUpAndAViewerReadsIt(): void
    {
        $owner = $this->newUser();
        $reader = $this->newUser();
        $scan = $this->newModel($owner, 'scan.las');
        $this->shareWithUser($scan, $owner, $reader, Constants::PERMISSION_READ);

        $saved = $this->basic($owner)->put(self::settingsUrl($scan->getId()), ['json' => ['up' => '+z']]);
        $this->assertSame(['canEdit' => true, 'unit' => null, 'up' => '+z'], self::json($saved));

        $this->assertSame(['canEdit' => false, 'unit' => null, 'up' => '+z'], self::json($this->basic($reader)->get(self::settingsUrl($scan->getId()))));
        $this->assertSame(403, $this->basic($reader)->put(self::settingsUrl($scan->getId()), ['json' => ['up' => '-y']])->getStatusCode());
    }

    public function testAnEditorTurnsASplatAndAViewerReadsIt(): void
    {
        $owner = $this->newUser();
        $reader = $this->newUser();
        $splat = $this->newModel($owner, 'capture.splat');
        $this->shareWithUser($splat, $owner, $reader, Constants::PERMISSION_READ);

        $saved = $this->basic($owner)->put(self::settingsUrl($splat->getId()), ['json' => ['up' => '-y']]);
        $this->assertSame(['canEdit' => true, 'unit' => null, 'up' => '-y'], self::json($saved));

        $this->assertSame(['canEdit' => false, 'unit' => null, 'up' => '-y'], self::json($this->basic($reader)->get(self::settingsUrl($splat->getId()))));
    }

    public function testUpCannotBeSetOnAMesh(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);

        $this->assertSame(400, $this->basic($owner)->put(self::settingsUrl($model->getId()), ['json' => ['up' => '+z']])->getStatusCode());
    }

    public function testClearingTheUpKeepsTheUnit(): void
    {
        $owner = $this->newUser();
        $scan = $this->newModel($owner, 'scan.las');
        $client = $this->basic($owner);
        $client->put(self::settingsUrl($scan->getId()), ['json' => ['unit' => 'ft', 'up' => '-y']]);

        $cleared = $client->put(self::settingsUrl($scan->getId()), ['json' => ['up' => null]]);

        $this->assertSame(['canEdit' => true, 'unit' => 'ft', 'up' => null], self::json($cleared));
    }

    public function testAPublicVisitorReadsUp(): void
    {
        $owner = $this->newUser();
        // A format the share routes serve today; las joins them with its loader
        $scan = $this->newModel($owner, 'scan.ply');
        $this->basic($owner)->put(self::settingsUrl($scan->getId()), ['json' => ['up' => '-z']]);
        $token = $this->shareByLink($scan, $owner);

        $answer = self::json($this->anonymous()->get(self::publicSettingsUrl($token, $scan->getId()), ['headers' => ['OCS-APIRequest' => 'true']]));

        $this->assertSame(['canEdit' => false, 'unit' => null, 'up' => '-z'], $answer);
    }

    public function testASessionWriteWithoutTheRequestTokenIsRejected(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        [$client, $token] = $this->session($owner);

        $without = $client->put(self::settingsUrl($model->getId()), ['json' => ['unit' => 'in']]);
        $with = $client->put(self::settingsUrl($model->getId()), ['json' => ['unit' => 'cm'], 'headers' => ['requesttoken' => $token]]);

        $this->assertSame(412, $without->getStatusCode());
        $this->assertSame(200, $with->getStatusCode(), 'the same session with its token is accepted, so the rejection was the token');
        $this->assertSame('cm', self::json($with)['unit']);
    }

    public function testAPublicLinkShowsTheUnitReadOnly(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        $this->basic($owner)->put(self::settingsUrl($model->getId()), ['json' => ['unit' => 'in']]);
        $token = $this->shareByLink($model, $owner);
        $url = self::publicSettingsUrl($token, $model->getId());
        $headers = ['OCS-APIRequest' => 'true'];

        $this->assertSame(['canEdit' => false, 'unit' => 'in', 'up' => null], self::json($this->anonymous()->get($url, ['headers' => $headers])));
        foreach (['POST', 'PUT', 'PATCH', 'DELETE'] as $method) {
            $status = $this->anonymous()->request($method, $url, ['json' => ['unit' => 'cm'], 'headers' => $headers])->getStatusCode();
            $this->assertGreaterThanOrEqual(400, $status, "$method on the public route must fail");
        }
        $this->assertSame('in', self::json($this->basic($owner)->get(self::settingsUrl($model->getId())))['unit']);
    }

    public function testAPasswordProtectedLinkWithoutThePasswordGetsNothing(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        $this->basic($owner)->put(self::settingsUrl($model->getId()), ['json' => ['unit' => 'us-ft']]);
        $token = $this->shareByLink($model, $owner, 'link-password-Aa1!');

        $response = $this->anonymous()->get(self::publicSettingsUrl($token, $model->getId()), ['headers' => ['OCS-APIRequest' => 'true']]);

        $this->assertNotSame(200, $response->getStatusCode());
        $this->assertStringNotContainsString('us-ft', (string) $response->getBody());
    }

    public function testTheUnitFollowsARename(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        $this->basic($owner)->put(self::settingsUrl($model->getId()), ['json' => ['unit' => 'm']]);
        $home = Server::get(IRootFolder::class)->getUserFolder($owner);
        $moved = $model->move($home->newFolder('moved')->getPath() . '/renamed.stl');

        $this->assertSame($model->getId(), $moved->getId());
        $this->assertSame('m', self::json($this->basic($owner)->get(self::settingsUrl($moved->getId())))['unit']);
    }
}
