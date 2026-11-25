<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Listener;

use OCA\Files\Event\LoadSidebar;
use OCA\ThreeDViewer\Listener\LoadSidebarListener;
use OCP\EventDispatcher\Event;
use PHPUnit\Framework\TestCase;

/**
 * The "3D" tab's script is added where the Files app asks for sidebar scripts, and nowhere
 * else: it is its own entry, so a page with no sidebar must not pay for it.
 */
class LoadSidebarListenerTest extends TestCase
{
    private function listener(int &$loads): LoadSidebarListener
    {
        return new class ($loads) extends LoadSidebarListener {
            public function __construct(private int &$loads)
            {
            }

            protected function addSidebarAssets(): void
            {
                $this->loads++;
            }
        };
    }

    public function testLoadsTheTabWhenTheFilesAppAsksForSidebarScripts(): void
    {
        $loads = 0;

        $this->listener($loads)->handle(new LoadSidebar());

        $this->assertSame(1, $loads);
    }

    public function testIgnoresEveryOtherEvent(): void
    {
        $loads = 0;

        $this->listener($loads)->handle(new Event());

        $this->assertSame(0, $loads);
    }
}
