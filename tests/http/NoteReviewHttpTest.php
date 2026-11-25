<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Http;

require_once __DIR__ . '/HttpTestCase.php';

use OCA\ThreeDViewer\Db\NoteReplyMapper;
use OCP\Constants;
use OCP\Server;

/**
 * Note review over real HTTP: resolving, replies and @mentions, and who may do what.
 *
 * Through the real middleware, so the CSRF check and the share-password check are in the
 * way as they are for a browser. What is asserted is what the API answers and what it
 * leaves in the database — never what a stub says.
 */
class NoteReviewHttpTest extends HttpTestCase
{
    private const READ = Constants::PERMISSION_READ;
    private const EDIT = Constants::PERMISSION_READ | Constants::PERMISSION_UPDATE;

    public function testANewNoteIsOpenAndCanBeResolvedAndReopenedByAnEditor(): void
    {
        $owner = $this->newUser();
        $editor = $this->newUser();
        $model = $this->newModel($owner);
        $this->shareWithUser($model, $owner, $editor, self::EDIT);
        $noteId = $this->addNote($owner, $model->getId(), 'Check');

        $this->assertSame('open', $this->noteOf($owner, $model->getId(), $noteId)['state']);

        $resolved = $this->basic($editor)->patch(self::stateUrl($model->getId(), $noteId), ['json' => ['state' => 'resolved']]);
        $this->assertSame(200, $resolved->getStatusCode());
        $body = self::json($resolved);
        $this->assertSame('resolved', $body['state']);
        $this->assertSame($editor, $body['resolvedBy']['uid']);
        $this->assertIsInt($body['resolvedAt']);

        $seenByOwner = $this->noteOf($owner, $model->getId(), $noteId);
        $this->assertSame('resolved', $seenByOwner['state']);
        $this->assertSame($editor, $seenByOwner['resolvedBy']['uid']);

        $reopened = self::json($this->basic($owner)->patch(self::stateUrl($model->getId(), $noteId), ['json' => ['state' => 'open']]));
        $this->assertSame('open', $reopened['state']);
        $this->assertNull($reopened['resolvedBy']);
        $this->assertNull($reopened['resolvedAt']);
    }

    public function testAViewOnlyUserCannotResolveReplyEditOrDeleteReplies(): void
    {
        $owner = $this->newUser();
        $viewer = $this->newUser();
        $model = $this->newModel($owner);
        $this->shareWithUser($model, $owner, $viewer, self::READ);
        $fileId = $model->getId();
        $noteId = $this->addNote($owner, $fileId, 'Check');
        $replyId = $this->addReply($owner, $fileId, $noteId, 'Mine');
        $client = $this->basic($viewer);

        $this->assertSame(403, $client->patch(self::stateUrl($fileId, $noteId), ['json' => ['state' => 'resolved']])->getStatusCode());
        $this->assertSame(403, $client->post(self::repliesUrl($fileId, $noteId), ['json' => ['text' => 'No']])->getStatusCode());
        $this->assertSame(403, $client->patch(self::repliesUrl($fileId, $noteId, $replyId), ['json' => ['text' => 'No']])->getStatusCode());
        $this->assertSame(403, $client->delete(self::repliesUrl($fileId, $noteId, $replyId))->getStatusCode());
        $this->assertSame(403, $client->get(self::peopleUrl($fileId) . '?search=a')->getStatusCode());

        $note = $this->noteOf($viewer, $fileId, $noteId);
        $this->assertSame('open', $note['state']);
        $this->assertSame('Mine', $note['replies'][0]['text'], 'a viewer still reads the thread');
        $this->assertCount(1, $note['replies']);
    }

    public function testAStrangerGetsNotFoundForEveryReviewRoute(): void
    {
        $owner = $this->newUser();
        $stranger = $this->newUser();
        $model = $this->newModel($owner);
        $fileId = $model->getId();
        $noteId = $this->addNote($owner, $fileId, 'Check');
        $replyId = $this->addReply($owner, $fileId, $noteId, 'Mine');
        $client = $this->basic($stranger);

        $this->assertSame(404, $client->patch(self::stateUrl($fileId, $noteId), ['json' => ['state' => 'resolved']])->getStatusCode());
        $this->assertSame(404, $client->post(self::repliesUrl($fileId, $noteId), ['json' => ['text' => 'No']])->getStatusCode());
        $this->assertSame(404, $client->patch(self::repliesUrl($fileId, $noteId, $replyId), ['json' => ['text' => 'No']])->getStatusCode());
        $this->assertSame(404, $client->delete(self::repliesUrl($fileId, $noteId, $replyId))->getStatusCode());
        $this->assertSame(404, $client->get(self::peopleUrl($fileId) . '?search=a')->getStatusCode());
    }

    public function testRepliesAreOrderedKeepTheirAuthorAndAnyEditorMayEditOrDeleteThem(): void
    {
        $owner = $this->newUser();
        $editor = $this->newUser();
        $model = $this->newModel($owner);
        $this->shareWithUser($model, $owner, $editor, self::EDIT);
        $fileId = $model->getId();
        $noteId = $this->addNote($owner, $fileId, 'Check');

        $first = $this->addReply($owner, $fileId, $noteId, 'First');
        $second = $this->addReply($editor, $fileId, $noteId, 'Second');

        $thread = $this->noteOf($owner, $fileId, $noteId)['replies'];
        $this->assertSame(['First', 'Second'], array_column($thread, 'text'));
        $this->assertSame([$owner, $editor], array_map(fn (array $r) => $r['author']['uid'], $thread));

        // The rule is the notes': whoever may add notes may change any of them
        $edited = $this->basic($editor)->patch(self::repliesUrl($fileId, $noteId, $first), ['json' => ['text' => 'First, edited']]);
        $this->assertSame(200, $edited->getStatusCode());
        $this->assertSame('First, edited', self::json($edited)['text']);
        $this->assertSame(204, $this->basic($owner)->delete(self::repliesUrl($fileId, $noteId, $second))->getStatusCode());
        $this->assertSame(['First, edited'], array_column($this->noteOf($owner, $fileId, $noteId)['replies'], 'text'));
    }

    public function testAReplyNeedsTextWithinTheLimit(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        $fileId = $model->getId();
        $noteId = $this->addNote($owner, $fileId, 'Check');
        $client = $this->basic($owner);
        $url = self::repliesUrl($fileId, $noteId);

        $this->assertSame(400, $client->post($url, ['json' => ['text' => '']])->getStatusCode());
        $this->assertSame(400, $client->post($url, ['json' => ['text' => "  \n "]])->getStatusCode());
        $this->assertSame(400, $client->post($url, ['json' => ['text' => str_repeat('a', 2001)]])->getStatusCode());
        $this->assertSame(400, $client->post($url, ['json' => ['text' => ['x']]])->getStatusCode());
        $this->assertSame(400, $client->post($url, ['json' => []])->getStatusCode());
        $this->assertSame(201, $client->post($url, ['json' => ['text' => str_repeat('a', 2000)]])->getStatusCode());
        $this->assertSame(400, $client->patch(self::stateUrl($fileId, $noteId), ['json' => ['state' => 'archived']])->getStatusCode());
        $this->assertCount(1, $this->noteOf($owner, $fileId, $noteId)['replies']);
    }

    public function testAReplyToAResolvedNoteIsAllowedAndLeavesItResolved(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        $fileId = $model->getId();
        $noteId = $this->addNote($owner, $fileId, 'Check');
        $this->basic($owner)->patch(self::stateUrl($fileId, $noteId), ['json' => ['state' => 'resolved']]);

        $reply = $this->basic($owner)->post(self::repliesUrl($fileId, $noteId), ['json' => ['text' => 'Thanks, done']]);

        $this->assertSame(201, $reply->getStatusCode());
        $this->assertSame('resolved', $this->noteOf($owner, $fileId, $noteId)['state']);
    }

    public function testAReplyIdOrNoteIdFromAnotherModelIsNotFound(): void
    {
        $owner = $this->newUser();
        $one = $this->newModel($owner, 'one.stl');
        $two = $this->newModel($owner, 'two.stl');
        $noteOne = $this->addNote($owner, $one->getId(), 'On one');
        $noteTwo = $this->addNote($owner, $two->getId(), 'On two');
        $replyOne = $this->addReply($owner, $one->getId(), $noteOne, 'Reply on one');
        $client = $this->basic($owner);

        // The note belongs to the other model, and the reply to the other note
        $this->assertSame(404, $client->post(self::repliesUrl($two->getId(), $noteOne), ['json' => ['text' => 'x']])->getStatusCode());
        $this->assertSame(404, $client->patch(self::stateUrl($two->getId(), $noteOne), ['json' => ['state' => 'resolved']])->getStatusCode());
        $this->assertSame(404, $client->patch(self::repliesUrl($two->getId(), $noteTwo, $replyOne), ['json' => ['text' => 'x']])->getStatusCode());
        $this->assertSame(404, $client->delete(self::repliesUrl($two->getId(), $noteTwo, $replyOne))->getStatusCode());
        $this->assertSame(404, $client->delete(self::repliesUrl($one->getId(), $noteTwo, $replyOne))->getStatusCode());
        $this->assertSame('Reply on one', $this->noteOf($owner, $one->getId(), $noteOne)['replies'][0]['text']);
    }

    public function testDeletingANoteDeletesItsReplies(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        $fileId = $model->getId();
        $noteId = $this->addNote($owner, $fileId, 'Check');
        $this->addReply($owner, $fileId, $noteId, 'One');
        $this->addReply($owner, $fileId, $noteId, 'Two');
        $this->assertCount(2, Server::get(NoteReplyMapper::class)->findByNote($noteId));

        $this->assertSame(204, $this->basic($owner)->delete(self::notesUrl($fileId, $noteId))->getStatusCode());

        $this->assertSame([], Server::get(NoteReplyMapper::class)->findByNote($noteId));
        $this->assertSame([], Server::get(NoteReplyMapper::class)->findByFile($fileId));
    }

    public function testMentionsComeBackAsNamesForTheSignedInAndStayAsIdsInTheStoredText(): void
    {
        $owner = $this->newUser();
        $colleague = $this->newUser();
        $model = $this->newModel($owner);
        $this->shareWithUser($model, $owner, $colleague, self::EDIT);
        $fileId = $model->getId();
        $noteId = $this->addNote($owner, $fileId, "Ask @{$colleague} about this ");
        $this->addReply($owner, $fileId, $noteId, "Thanks @{$colleague}");

        $note = $this->noteOf($owner, $fileId, $noteId);

        $this->assertSame("Ask @{$colleague} about this ", $note['payload']['text'], 'the stored text keeps the id');
        $this->assertArrayHasKey($colleague, $note['mentions']);
        $this->assertArrayHasKey($colleague, $note['replies'][0]['mentions']);
    }

    public function testThePeopleOfferedAreThoseWhoCanOpenTheModel(): void
    {
        $owner = $this->newUser();
        $colleague = $this->newUser();
        $stranger = $this->newUser();
        $model = $this->newModel($owner);
        $this->shareWithUser($model, $owner, $colleague, self::EDIT);

        // Their ids share a prefix, so one search finds all three
        $found = self::json($this->basic($owner)->get(self::peopleUrl($model->getId()) . '?search=tdv-http'));

        $ids = array_column($found['people'], 'id');
        $this->assertContains($colleague, $ids);
        $this->assertNotContains($stranger, $ids, 'someone who cannot open the model is not offered');
        $this->assertNotContains($owner, $ids, 'nor the person searching');
    }

    public function testAPublicLinkShowsStateAndRepliesWithNoNamesAndNoMentions(): void
    {
        $owner = $this->newUser();
        $colleague = $this->newUser();
        $model = $this->newModel($owner);
        $this->shareWithUser($model, $owner, $colleague, self::EDIT);
        $fileId = $model->getId();
        $noteId = $this->addNote($owner, $fileId, "Hello @{$colleague} ");
        $this->addReply($colleague, $fileId, $noteId, "Fixed, @{$owner}");
        $this->basic($colleague)->patch(self::stateUrl($fileId, $noteId), ['json' => ['state' => 'resolved']]);
        $token = $this->shareByLink($model, $owner);

        $response = $this->anonymous()->get(self::publicNotesUrl($token, $fileId), ['headers' => ['OCS-APIRequest' => 'true']]);

        $this->assertSame(200, $response->getStatusCode());
        $note = self::json($response)['notes'][0];
        $this->assertSame('resolved', $note['state']);
        $this->assertIsInt($note['resolvedAt']);
        $this->assertNull($note['resolvedBy']);
        $this->assertSame('Hello @someone ', $note['payload']['text']);
        $this->assertSame('Fixed, @someone', $note['replies'][0]['text']);
        $this->assertNull($note['replies'][0]['author']);
        $body = (string) $response->getBody();
        $this->assertStringNotContainsString($owner, $body);
        $this->assertStringNotContainsString($colleague, $body);
        $this->assertStringNotContainsString('@', str_replace(['@someone'], '', $body), 'no email-like id either');
    }

    public function testNoReviewWriteReachesNotesThroughAPublicLink(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        $fileId = $model->getId();
        $noteId = $this->addNote($owner, $fileId, 'Check');
        $token = $this->shareByLink($model, $owner);
        $client = $this->anonymous();
        $headers = ['OCS-APIRequest' => 'true'];

        $base = self::publicNotesUrl($token, $fileId);
        foreach (['PATCH', 'PUT', 'POST', 'DELETE'] as $method) {
            foreach ([$base . '/' . $noteId . '/state', $base . '/' . $noteId . '/replies'] as $url) {
                $status = $client->request($method, $url, ['json' => ['state' => 'resolved', 'text' => 'x'], 'headers' => $headers])->getStatusCode();
                $this->assertGreaterThanOrEqual(400, $status, "$method $url must fail");
            }
        }
        // The signed-in routes do not answer a visitor either
        $this->assertGreaterThanOrEqual(400, $client->patch(self::stateUrl($fileId, $noteId), ['json' => ['state' => 'resolved'], 'headers' => $headers])->getStatusCode());
        $this->assertGreaterThanOrEqual(400, $client->post(self::repliesUrl($fileId, $noteId), ['json' => ['text' => 'x'], 'headers' => $headers])->getStatusCode());
        $note = $this->noteOf($owner, $fileId, $noteId);
        $this->assertSame('open', $note['state']);
        $this->assertSame([], $note['replies']);
    }

    public function testReviewWritesNeedTheRequestToken(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        $fileId = $model->getId();
        $noteId = $this->addNote($owner, $fileId, 'Check');
        [$client, $token] = $this->session($owner);
        $headers = ['headers' => ['requesttoken' => $token]];

        $this->assertSame(412, $client->patch(self::stateUrl($fileId, $noteId), ['json' => ['state' => 'resolved']])->getStatusCode());
        $this->assertSame(412, $client->post(self::repliesUrl($fileId, $noteId), ['json' => ['text' => 'Forged']])->getStatusCode());
        $this->assertSame(412, $client->get(self::peopleUrl($fileId) . '?search=a')->getStatusCode());
        $this->assertSame('open', $this->noteOf($owner, $fileId, $noteId)['state'], 'a rejected request changed nothing');
        $this->assertSame([], $this->noteOf($owner, $fileId, $noteId)['replies']);

        $this->assertSame(200, $client->patch(self::stateUrl($fileId, $noteId), ['json' => ['state' => 'resolved']] + $headers)->getStatusCode());
        $this->assertSame(201, $client->post(self::repliesUrl($fileId, $noteId), ['json' => ['text' => 'Real']] + $headers)->getStatusCode());
        $this->assertSame(200, $client->get(self::peopleUrl($fileId) . '?search=a', $headers)->getStatusCode());
    }

    private static function stateUrl(int $fileId, int $noteId): string
    {
        return self::notesUrl($fileId, $noteId) . '/state';
    }

    private static function repliesUrl(int $fileId, int $noteId, ?int $replyId = null): string
    {
        return self::notesUrl($fileId, $noteId) . '/replies' . ($replyId === null ? '' : '/' . $replyId);
    }

    private static function peopleUrl(int $fileId): string
    {
        return self::notesUrl($fileId) . '/people';
    }

    private function addNote(string $uid, int $fileId, string $text): int
    {
        $response = $this->basic($uid)->post(self::notesUrl($fileId), ['json' => self::annotation($text)]);
        $this->assertSame(201, $response->getStatusCode());

        return self::json($response)['id'];
    }

    private function addReply(string $uid, int $fileId, int $noteId, string $text): int
    {
        $response = $this->basic($uid)->post(self::repliesUrl($fileId, $noteId), ['json' => ['text' => $text]]);
        $this->assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return self::json($response)['id'];
    }

    /** @return array<string, mixed> */
    private function noteOf(string $uid, int $fileId, int $noteId): array
    {
        $notes = self::json($this->basic($uid)->get(self::notesUrl($fileId)))['notes'];
        foreach ($notes as $note) {
            if ($note['id'] === $noteId) {
                return $note;
            }
        }
        $this->fail("note $noteId is not in the list");
    }
}
