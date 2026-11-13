<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Activity;

use OCP\Activity\ActivitySettings;
use OCP\IL10N;

/**
 * The one switch for the stream and for email, under Settings > Notifications > Activity.
 *
 * Every event of the app carries this type, so a user who turns it off stops hearing about
 * notes added, changed and deleted on models, everywhere the Activity app would show them.
 * Email starts off: a stream entry is cheap to ignore, an email is not.
 *
 * The Activity app can also raise a notification of its own for a setting like this one.
 * That is switched off here, because the app sends notifications itself, collapsed and
 * kept to the people they matter to (see Notification\NoteNotificationPublisher), and the
 * Activity app's would come on top of them.
 *
 * @psalm-suppress UnusedClass Registered via info.xml at runtime.
 */
class Setting extends ActivitySettings
{
    /** The type every event of the app carries, and the identifier of this setting */
    public const TYPE = 'threedviewer_notes';

    /** @psalm-suppress PossiblyUnusedMethod Constructed by the DI container */
    public function __construct(
        private readonly IL10N $l,
    ) {
    }

    public function getIdentifier(): string
    {
        return self::TYPE;
    }

    public function getName(): string
    {
        return $this->l->t('Notes on a 3D model were added, changed or deleted');
    }

    public function getGroupIdentifier(): string
    {
        return 'threedviewer';
    }

    public function getGroupName(): string
    {
        return $this->l->t('3D Viewer');
    }

    public function getPriority(): int
    {
        return 60;
    }

    public function canChangeStream(): bool
    {
        return true;
    }

    public function isDefaultEnabledStream(): bool
    {
        return true;
    }

    public function canChangeMail(): bool
    {
        return true;
    }

    public function isDefaultEnabledMail(): bool
    {
        return false;
    }

    public function canChangeNotification(): bool
    {
        return false;
    }

    public function isDefaultEnabledNotification(): bool
    {
        return false;
    }
}
