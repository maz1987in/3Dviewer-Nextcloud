<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Activity;

use OCA\ThreeDViewer\Activity\Filter;
use OCA\ThreeDViewer\Activity\Setting;
use OCP\IL10N;
use OCP\IURLGenerator;
use PHPUnit\Framework\TestCase;

class SettingAndFilterTest extends TestCase
{
    private function l10n(): IL10N
    {
        $l = $this->createMock(IL10N::class);
        $l->method('t')->willReturnArgument(0);

        return $l;
    }

    public function testTheSettingCanBeTurnedOffForTheStreamAndForEmail(): void
    {
        $setting = new Setting($this->l10n());

        $this->assertTrue($setting->canChangeStream());
        $this->assertTrue($setting->canChangeMail());
    }

    public function testTheStreamStartsOnAndEmailStartsOff(): void
    {
        $setting = new Setting($this->l10n());

        $this->assertTrue($setting->isDefaultEnabledStream());
        $this->assertFalse($setting->isDefaultEnabledMail());
    }

    public function testTheActivityAppDoesNotAddNotificationsOfItsOwn(): void
    {
        // The app notifies by itself, collapsed and to the right people; the Activity app's would duplicate that
        $setting = new Setting($this->l10n());

        $this->assertFalse($setting->canChangeNotification());
        $this->assertFalse($setting->isDefaultEnabledNotification());
    }

    public function testTheSettingIsTheTypeTheEventsCarry(): void
    {
        $setting = new Setting($this->l10n());

        $this->assertSame('threedviewer_notes', $setting->getIdentifier());
        $this->assertSame(Setting::TYPE, $setting->getIdentifier());
        $this->assertSame('threedviewer', $setting->getGroupIdentifier());
        $this->assertNotSame('', $setting->getName());
        $this->assertNotSame('', $setting->getGroupName());
    }

    public function testTheFilterShowsOnlyThisAppsEvents(): void
    {
        $filter = new Filter($this->l10n(), $this->createMock(IURLGenerator::class));

        $this->assertSame('threedviewer', $filter->getIdentifier());
        $this->assertSame(['threedviewer'], $filter->allowedApps());
        $this->assertSame(['threedviewer_notes'], $filter->filterTypes(['file_changed', 'threedviewer_notes', 'shared']));
        $this->assertSame([], $filter->filterTypes(['file_changed']));
    }

    public function testTheFilterHasANameAndAnIcon(): void
    {
        $urls = $this->createMock(IURLGenerator::class);
        $urls->expects($this->once())->method('imagePath')->with('threedviewer', 'app-dark.svg')->willReturn('/img/app-dark.svg');
        $urls->method('getAbsoluteURL')->willReturnCallback(fn (string $path) => 'https://cloud.test' . $path);
        $filter = new Filter($this->l10n(), $urls);

        $this->assertSame('3D Viewer', $filter->getName());
        $this->assertSame('https://cloud.test/img/app-dark.svg', $filter->getIcon());
        $this->assertIsInt($filter->getPriority());
    }
}
