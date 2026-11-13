<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Activity;

use OCA\ThreeDViewer\AppInfo\Application;
use OCP\Activity\IFilter;
use OCP\IL10N;
use OCP\IURLGenerator;

/**
 * "3D Viewer" in the Activity app's sidebar: the stream narrowed to notes on models.
 *
 * The Files filter was not an option. It shows what the Files app and its siblings report,
 * by app, and an app cannot add itself to that list; these events would reach "All
 * activity" and a file's own Activity tab, but never a filter of their own.
 *
 * @psalm-suppress UnusedClass Registered via info.xml at runtime.
 */
class Filter implements IFilter
{
    /** @psalm-suppress PossiblyUnusedMethod Constructed by the DI container */
    public function __construct(
        private readonly IL10N $l,
        private readonly IURLGenerator $urls,
    ) {
    }

    public function getIdentifier(): string
    {
        return Application::APP_ID;
    }

    public function getName(): string
    {
        return $this->l->t('3D Viewer');
    }

    public function getPriority(): int
    {
        return 45;
    }

    public function getIcon(): string
    {
        return $this->urls->getAbsoluteURL($this->urls->imagePath(Application::APP_ID, 'app-dark.svg'));
    }

    /**
     * @param string[] $types
     * @return string[]
     */
    public function filterTypes(array $types): array
    {
        return array_values(array_intersect($types, [Setting::TYPE]));
    }

    /**
     * @return string[]
     */
    public function allowedApps(): array
    {
        return [Application::APP_ID];
    }
}
