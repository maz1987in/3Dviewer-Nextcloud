<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Service\NoteAccess;
use OCA\ThreeDViewer\Service\NoteAccessResult;
use OCA\ThreeDViewer\Service\NotePeople;
use OCP\Collaboration\Collaborators\ISearch;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class NotePeopleTest extends TestCase
{
    private ISearch&MockObject $search;
    private NoteAccess&MockObject $access;
    private NotePeople $people;

    /** @var list<string> who can open the model */
    private array $canOpen = ['sara', 'omar', 'lina'];

    protected function setUp(): void
    {
        $this->search = $this->createMock(ISearch::class);
        $this->access = $this->createMock(NoteAccess::class);
        $this->access->method('forUser')->willReturnCallback(
            fn (int $fileId, string $uid) => $fileId === 7 && in_array($uid, $this->canOpen, true) ? new NoteAccessResult(false) : null,
        );
        $this->people = new NotePeople($this->search, $this->access);
    }

    private function user(string $uid, string $label): array
    {
        return ['label' => $label, 'value' => ['shareType' => 0, 'shareWith' => $uid]];
    }

    public function testOnlyPeopleWhoCanOpenTheModelAreOffered(): void
    {
        $this->search->method('search')->willReturn([[
            'users' => [$this->user('sara', 'Sara Ahmed'), $this->user('stranger', 'Sam Stranger'), $this->user('omar', 'Omar Khan')],
        ], false]);

        $this->assertSame(
            [['id' => 'sara', 'label' => 'Sara Ahmed'], ['id' => 'omar', 'label' => 'Omar Khan']],
            $this->people->search(7, 'lina', 's'),
        );
    }

    public function testTheSearcherIsNotOfferedThemselves(): void
    {
        $this->search->method('search')->willReturn([['users' => [$this->user('lina', 'Lina'), $this->user('sara', 'Sara')]], false]);

        $this->assertSame([['id' => 'sara', 'label' => 'Sara']], $this->people->search(7, 'lina', ''));
    }

    public function testExactMatchesComeFirstAndNobodyIsOfferedTwice(): void
    {
        $this->search->method('search')->willReturn([[
            'exact' => ['users' => [$this->user('omar', 'Omar Khan')]],
            'users' => [$this->user('sara', 'Sara Ahmed'), $this->user('omar', 'Omar Khan')],
        ], false]);

        $this->assertSame(['omar', 'sara'], array_column($this->people->search(7, 'lina', 'o'), 'id'));
    }

    public function testAskingAboutAnotherModelOffersNobody(): void
    {
        $this->search->method('search')->willReturn([['users' => [$this->user('sara', 'Sara')]], false]);

        $this->assertSame([], $this->people->search(8, 'lina', 's'));
    }

    public function testNoMoreThanTheLimitAreOffered(): void
    {
        $many = array_map(fn (int $i) => 'p' . $i, range(1, 30));
        $this->canOpen = $many;
        $this->search->method('search')->willReturn([['users' => array_map(fn (string $uid) => $this->user($uid, $uid), $many)], false]);

        $this->assertCount(NotePeople::LIMIT, $this->people->search(7, 'lina', 'p'));
    }

    public function testTheSearchIsOfUsersOnlyAndTheQueryIsBounded(): void
    {
        $this->search->expects($this->once())->method('search')
            ->with(str_repeat('a', 64), [0], false, $this->anything(), 0)
            ->willReturn([[], false]);

        $this->assertSame([], $this->people->search(7, 'lina', str_repeat('a', 200)));
    }

    public function testNumericUserIdsStayStrings(): void
    {
        $this->canOpen = ['1234'];
        $this->search->method('search')->willReturn([['users' => [$this->user('1234', 'Numbered')]], false]);

        $this->assertSame([['id' => '1234', 'label' => 'Numbered']], $this->people->search(7, 'lina', '12'));
    }

    public function testMalformedEntriesAreSkipped(): void
    {
        $this->search->method('search')->willReturn([[
            'users' => ['junk', ['label' => 'No value'], ['value' => ['shareWith' => '']], ['value' => ['shareWith' => 5]], $this->user('sara', '')],
        ], false]);

        $this->assertSame([['id' => 'sara', 'label' => 'sara']], $this->people->search(7, 'lina', ''));
    }
}
