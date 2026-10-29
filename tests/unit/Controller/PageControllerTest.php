<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Controller;

use OCA\ThreeDViewer\Controller\PageController;
use OCA\ThreeDViewer\Service\EmbedOrigins;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\ResponseBuilder;
use OCP\AppFramework\Services\IInitialState;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\IConfig;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserSession;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class PageControllerTest extends TestCase
{
    /** @var array<string, mixed> */
    private array $provided = [];

    /** @return array<string, array{bool}> */
    public static function embedding(): array
    {
        return ['a site is listed' => [true], 'no site is listed' => [false]];
    }

    #[DataProvider('embedding')]
    public function testTheAppPageSaysWhetherEmbeddingIsOn(bool $enabled): void
    {
        $this->controller($enabled)->index();

        $this->assertSame(['enabled' => $enabled], $this->provided['embed'] ?? null);
    }

    #[DataProvider('embedding')]
    public function testTheViewerPageSaysWhetherEmbeddingIsOn(bool $enabled): void
    {
        $this->controller($enabled)->viewer('42');

        $this->assertSame(['enabled' => $enabled], $this->provided['embed'] ?? null);
    }

    private function controller(bool $embedding): PageController
    {
        $state = $this->createMock(IInitialState::class);
        $state->method('provideInitialState')->willReturnCallback(function (string $key, mixed $value): void {
            $this->provided[$key] = $value;
        });
        $origins = $this->createMock(EmbedOrigins::class);
        $origins->method('isEnabled')->willReturn($embedding);
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('alice');
        $session = $this->createMock(IUserSession::class);
        $session->method('getUser')->willReturn($user);
        $config = $this->createMock(IConfig::class);
        $config->method('getUserValue')->willReturnArgument(3);
        $root = $this->createMock(IRootFolder::class);
        $root->method('getUserFolder')->willReturn($this->createMock(Folder::class));

        return new PageController(
            'threedviewer',
            $this->createMock(IRequest::class),
            new ResponseBuilder($this->createMock(ModelFileSupport::class)),
            $state,
            $config,
            $session,
            $root,
            $origins,
        );
    }
}
