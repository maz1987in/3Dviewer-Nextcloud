<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Integration;

use OCA\ThreeDViewer\Service\NoteAccess;
use OCA\ThreeDViewer\Service\NoteMentions;
use OCA\ThreeDViewer\Service\NotePeople;
use OCP\Constants;
use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\IConfig;
use OCP\IGroupManager;
use OCP\IUserManager;
use OCP\IUserSession;
use OCP\Server;
use OCP\Share\IManager as ShareManager;
use OCP\Share\IShare;
use PHPUnit\Framework\TestCase;

/**
 * Who a mention may name, against the real server: the account must exist, be able to open
 * the file, and be one the people search lets the writer find, which is where the
 * administrator's sharing rules apply. Everything else is plain text, and the same plain
 * text whether the account does not exist or merely may not be shown.
 */
class NoteMentionsTest extends TestCase
{
    private const PASSWORD = 'integration-suite-password-Aa1!';

    private string $actor;
    private string $colleague;
    private string $outsider;
    private File $model;
    private ?string $group = null;
    private string $restrictionBefore;

    protected function setUp(): void
    {
        $users = Server::get(IUserManager::class);
        $suffix = bin2hex(random_bytes(5));
        $this->actor = 'tdv-m-actor-' . $suffix;
        $this->colleague = 'tdv-m-colleague-' . $suffix;
        $this->outsider = 'tdv-m-outsider-' . $suffix;
        foreach ([$this->actor, $this->colleague, $this->outsider] as $uid) {
            $users->createUser($uid, self::PASSWORD);
        }
        $this->model = Server::get(IRootFolder::class)->getUserFolder($this->actor)->newFile('model.stl', 'solid x');

        $manager = Server::get(ShareManager::class);
        $share = $manager->newShare();
        $share->setNode($this->model)
            ->setShareType(IShare::TYPE_USER)
            ->setSharedWith($this->colleague)
            ->setSharedBy($this->actor)
            ->setShareOwner($this->actor)
            ->setPermissions(Constants::PERMISSION_READ | Constants::PERMISSION_UPDATE);
        $manager->createShare($share);

        $this->restrictionBefore = Server::get(IConfig::class)->getAppValue('core', 'shareapi_only_share_with_group_members', 'no');
        // The writer is the user of this request, as they are when they save a note
        Server::get(IUserSession::class)->setUser($users->get($this->actor));
    }

    protected function tearDown(): void
    {
        Server::get(IConfig::class)->setAppValue('core', 'shareapi_only_share_with_group_members', $this->restrictionBefore);
        Server::get(IUserSession::class)->setUser(null);
        $users = Server::get(IUserManager::class);
        foreach ([$this->actor, $this->colleague, $this->outsider] as $uid) {
            $users->get($uid)?->delete();
        }
        if ($this->group !== null) {
            Server::get(IGroupManager::class)->get($this->group)?->delete();
        }
    }

    private function mentions(): NoteMentions
    {
        // A fresh one each time: what it has resolved is remembered for the request
        return new NoteMentions(
            Server::get(IUserManager::class),
            Server::get(NoteAccess::class),
            Server::get(NotePeople::class),
            Server::get(IUserSession::class),
        );
    }

    public function testAColleagueWhoCanOpenTheFileIsNamed(): void
    {
        $text = "Over to @{$this->colleague} ";

        $this->assertSame([$this->colleague], $this->mentions()->uids($text, $this->model->getId()));
        $this->assertSame([$this->colleague => $this->colleague], $this->mentions()->names($text, $this->model->getId()));
    }

    public function testAnExistingAccountWithoutAccessAndAnAccountThatDoesNotExistLookTheSame(): void
    {
        $withAccount = $this->mentions()->find("Hello @{$this->outsider} ", $this->model->getId());
        $withoutAccount = $this->mentions()->find('Hello @tdv-m-nobody-' . bin2hex(random_bytes(3)) . ' ', $this->model->getId());

        $this->assertSame([], $withAccount);
        $this->assertSame([], $withoutAccount);
        $this->assertSame([], $this->mentions()->uids("@{$this->outsider} @{$this->colleague}x", $this->model->getId()));
        $this->assertSame([], $this->mentions()->names("@{$this->outsider}", $this->model->getId()));
    }

    public function testWhenOnlyGroupMembersMayBeSharedWithAColleagueOutsideTheWritersGroupsIsNotNamed(): void
    {
        $groups = Server::get(IGroupManager::class);
        $users = Server::get(IUserManager::class);
        $this->group = 'tdv-m-group-' . bin2hex(random_bytes(4));
        $group = $groups->createGroup($this->group);
        $group->addUser($users->get($this->actor));
        $text = "Over to @{$this->colleague} ";

        // The rule off, the colleague is named; on, they are no longer someone this writer may find
        $this->assertSame([$this->colleague], $this->mentions()->uids($text, $this->model->getId()));
        Server::get(IConfig::class)->setAppValue('core', 'shareapi_only_share_with_group_members', 'yes');
        $this->assertSame([], $this->mentions()->uids($text, $this->model->getId()));
        $this->assertSame([], $this->mentions()->names($text, $this->model->getId()));

        // In a group they share, they are
        $group->addUser($users->get($this->colleague));
        $this->assertSame([$this->colleague], $this->mentions()->uids($text, $this->model->getId()));
    }

    public function testAPublicLinkNamesNobody(): void
    {
        $text = "Hello @{$this->colleague}, @{$this->outsider} and @nobody-at-all";

        $this->assertSame('Hello @someone, @someone and @someone', $this->mentions()->redact($text));
    }
}
