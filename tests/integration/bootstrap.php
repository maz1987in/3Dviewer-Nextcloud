<?php

declare(strict_types=1);

/**
 * Boots a real Nextcloud server for the integration suite.
 *
 * The unit suite mocks every server interface, which is what let two real bugs through:
 * `FileIndexMapper` called `escapeLikeParameter()` on the query builder, where the
 * interface does not declare it — a mock happily answers anyway — and `getFolders()`
 * built child paths with `str_replace()`, which a mocked folder never contradicted.
 * Nothing here mocks the server; the tests run against its container, its database and
 * its storage.
 *
 * Two layouts are supported. In CI the app sits inside a checkout of nextcloud/server,
 * which ships its own test bootstrap. Against an installed instance — the dev container,
 * for example — only lib/base.php exists, which is what occ itself loads.
 *
 * There is deliberately no third branch. A suite that skips when it cannot find a server
 * reports coverage it does not have, which is exactly why the previous integration
 * workflow was retired: it ran the unit suite under another name against no server at
 * all, and passed.
 */
$appRoot = dirname(__DIR__, 2);
$serverRoot = dirname($appRoot, 2);

require_once $appRoot . '/vendor/autoload.php';

$serverTestBootstrap = $serverRoot . '/tests/bootstrap.php';
$serverBase = $serverRoot . '/lib/base.php';

if (file_exists($serverTestBootstrap)) {
    require_once $serverTestBootstrap;
} elseif (file_exists($serverBase)) {
    if (!defined('OC_CONSOLE')) {
        define('OC_CONSOLE', 1);
    }
    require_once $serverBase;
} else {
    fwrite(STDERR, <<<TEXT

        The integration suite found no Nextcloud server.

        Looked for:
          {$serverTestBootstrap}
          {$serverBase}

        The app has to sit inside a server tree — <server>/apps/threedviewer — so that
        it can reach the real container, database and storage. Run the unit suite with
        `composer test:unit` instead; it needs no server.

        TEXT);
    exit(1);
}

if (!class_exists('OC')) {
    fwrite(STDERR, "Nextcloud loaded but its bootstrap did not complete.\n");
    exit(1);
}

// The app supplies the services under test, so the suite is meaningless if the server
// did not load it.
\OC_App::loadApp('threedviewer');
