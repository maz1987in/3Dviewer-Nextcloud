<?php

declare(strict_types=1);

/**
 * Test-only stub of the Files app's sidebar event.
 *
 * `files` ships with the server rather than in the `nextcloud/ocp` package, so this class
 * does not exist when the unit suite runs outside a full Nextcloud tree. It is loaded from
 * tests/bootstrap.php only when the real class is absent — inside a server, the real one
 * always wins.
 *
 * Mirrors apps/files/lib/Event/LoadSidebar.php, which is an empty event on every supported
 * server version (31 to 35).
 */

namespace OCA\Files\Event;

use OCP\EventDispatcher\Event;

class LoadSidebar extends Event
{
}
