<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Settings;

use OCA\ThreeDViewer\Service\EmbedOrigins;
use OCA\ThreeDViewer\Settings\Admin;
use OCP\AppFramework\Services\IInitialState;
use PHPUnit\Framework\TestCase;

class AdminTest extends TestCase
{
    public function testProvidesTheListAndRendersTheForm(): void
    {
        $origins = $this->createMock(EmbedOrigins::class);
        $origins->method('list')->willReturn(['https://shop.example']);
        $state = $this->createMock(IInitialState::class);
        $state->expects($this->once())->method('provideInitialState')->with('embed-admin', ['origins' => ['https://shop.example']]);

        $form = (new Admin($state, $origins))->getForm();

        $this->assertSame('settings-admin', $form->getTemplateName());
        $this->assertSame('threedviewer', $form->getApp());
    }

    public function testBelongsToTheAppSection(): void
    {
        $admin = new Admin($this->createMock(IInitialState::class), $this->createMock(EmbedOrigins::class));

        $this->assertSame('threedviewer', $admin->getSection());
    }
}
