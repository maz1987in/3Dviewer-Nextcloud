<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Listener;

use OCA\Files_Sharing\Event\BeforeTemplateRenderedEvent;
use OCA\ThreeDViewer\Listener\LoadPublicShareListener;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCP\AppFramework\Services\IInitialState;
use OCP\EventDispatcher\Event;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Share\IShare;
use PHPUnit\Framework\TestCase;

/**
 * The public share page never loaded the viewer bundle (issue #115).
 *
 * `LoadFilesListener` bails on `!isLoggedIn()`, and the Viewer app's `LoadViewer`
 * event is not dispatched on the public template — so nothing registered the 3D
 * handler for anonymous visitors. This listener fills that gap, and must be
 * selective: loading a multi-megabyte 3D bundle on every share link, or on the
 * password prompt, would be a regression for shares that have nothing to do with
 * 3D models.
 */
class LoadPublicShareListenerTest extends TestCase
{
    protected function setUp(): void
    {
        if (!class_exists(BeforeTemplateRenderedEvent::class)) {
            $this->markTestSkipped('files_sharing event not available');
        }
    }

    public function testLoadsForSupportedSingleFileShare(): void
    {
        [$listener, $state] = $this->listenerFor($this->fileShare('stl', 42));

        $state->expects($this->once())->method('provideInitialState')
            ->with('publicShare', $this->callback(fn ($v) => $v['token'] === 'tok'
                && $v['fileId'] === 42
                && $v['isSingleFile'] === true
                // The single-file page mounts the viewer directly, so it needs
                // enough to render without a file listing to consult.
                && $v['filename'] === 'model.stl'
                && $v['mime'] === 'model/stl'));

        $listener->handle($this->event($this->fileShare('stl', 42)));

        $this->assertTrue($listener->scriptLoaded);
    }

    public function testLoadsForFolderShareWithoutAFileId(): void
    {
        [$listener, $state] = $this->listenerFor(null);

        $state->expects($this->once())->method('provideInitialState')
            ->with('publicShare', $this->callback(fn ($v) => $v['token'] === 'tok'
                && $v['fileId'] === null
                && $v['isSingleFile'] === false));

        $listener->handle($this->event($this->folderShare()));

        $this->assertTrue($listener->scriptLoaded);
    }

    public function testDoesNotLoadForUnsupportedSingleFileShare(): void
    {
        [$listener, $state] = $this->listenerFor(null);
        $state->expects($this->never())->method('provideInitialState');

        $listener->handle($this->event($this->fileShare('txt', 7)));

        $this->assertFalse($listener->scriptLoaded, 'A shared .txt must not pull in the 3D bundle');
    }

    public function testDoesNotLoadOnThePasswordPrompt(): void
    {
        [$listener, $state] = $this->listenerFor(null);
        $state->expects($this->never())->method('provideInitialState');

        $listener->handle($this->event(
            $this->fileShare('stl', 42),
            BeforeTemplateRenderedEvent::SCOPE_PUBLIC_SHARE_AUTH
        ));

        $this->assertFalse($listener->scriptLoaded, 'The auth screen must stay untouched');
    }

    public function testIgnoresUnrelatedEvents(): void
    {
        [$listener, $state] = $this->listenerFor(null);
        $state->expects($this->never())->method('provideInitialState');

        $listener->handle(new Event());

        $this->assertFalse($listener->scriptLoaded);
    }

    /** @return array{0: object, 1: IInitialState} */
    private function listenerFor(?IShare $unused): array
    {
        $state = $this->createMock(IInitialState::class);

        $support = $this->createMock(ModelFileSupport::class);
        $support->method('isSupported')->willReturnCallback(
            static fn (string $ext): bool => $ext === 'stl'
        );

        $listener = new class ($support, $state) extends LoadPublicShareListener {
            public bool $scriptLoaded = false;

            protected function addViewerScript(): void
            {
                $this->scriptLoaded = true;
            }
        };

        return [$listener, $state];
    }

    private function event(IShare $share, ?string $scope = null): BeforeTemplateRenderedEvent
    {
        return new BeforeTemplateRenderedEvent($share, $scope);
    }

    private function fileShare(string $extension, int $fileId): IShare
    {
        $file = $this->createMock(File::class);
        $file->method('getExtension')->willReturn($extension);
        $file->method('getId')->willReturn($fileId);
        $file->method('getName')->willReturn('model.' . $extension);
        $file->method('getMimeType')->willReturn('model/' . $extension);

        return $this->share($file);
    }

    private function folderShare(): IShare
    {
        return $this->share($this->createMock(Folder::class));
    }

    private function share(object $node): IShare
    {
        $share = $this->createMock(IShare::class);
        $share->method('getNode')->willReturn($node);
        $share->method('getToken')->willReturn('tok');

        return $share;
    }
}
