<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Listener;

use OCA\ThreeDViewer\Listener\RenderReferenceListener;
use OCP\Collaboration\Reference\RenderReferenceEvent;
use OCP\EventDispatcher\Event;
use PHPUnit\Framework\TestCase;

/**
 * The card is loaded where link previews render, and nowhere else: it is its own entry,
 * so a page that renders no previews must not pay for it.
 */
class RenderReferenceListenerTest extends TestCase
{
    private function listener(int &$loads): RenderReferenceListener
    {
        return new class ($loads) extends RenderReferenceListener {
            public function __construct(private int &$loads)
            {
            }

            protected function addCardAssets(): void
            {
                $this->loads++;
            }
        };
    }

    public function testLoadsTheCardWhenAPageRendersLinkPreviews(): void
    {
        $loads = 0;

        $this->listener($loads)->handle(new RenderReferenceEvent());

        $this->assertSame(1, $loads);
    }

    public function testIgnoresEveryOtherEvent(): void
    {
        $loads = 0;

        $this->listener($loads)->handle(new Event());

        $this->assertSame(0, $loads);
    }
}
