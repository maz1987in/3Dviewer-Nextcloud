<?php

declare(strict_types=1);

/**
 * Test-only stub of the files_sharing public-share event.
 *
 * `files_sharing` ships with the server rather than in the `nextcloud/ocp` package,
 * so this class does not exist when the unit suite runs outside a full Nextcloud
 * tree. It is loaded from tests/bootstrap.php only when the real class is absent —
 * inside a server, the real one always wins.
 *
 * Mirrors apps/files_sharing/lib/Event/BeforeTemplateRenderedEvent.php. If the
 * upstream signature changes, LoadPublicShareListener will still be exercised
 * against the real class in the live-container checks, and against this one here.
 */

namespace OCA\Files_Sharing\Event;

use OCP\EventDispatcher\Event;
use OCP\Share\IShare;

class BeforeTemplateRenderedEvent extends Event
{
    public const SCOPE_PUBLIC_SHARE_AUTH = 'publicShareAuth';

    public function __construct(
        private IShare $share,
        private ?string $scope = null,
    ) {
        parent::__construct();
    }

    public function getShare(): IShare
    {
        return $this->share;
    }

    public function getScope(): ?string
    {
        return $this->scope;
    }
}
