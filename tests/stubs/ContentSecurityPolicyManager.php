<?php

declare(strict_types=1);

/**
 * Test-only stub of the server's CSP manager.
 *
 * `OCP\Security\CSP\AddContentSecurityPolicyEvent` is public API, but its constructor
 * takes this private server class, which the `nextcloud/ocp` package does not ship. It
 * is loaded from tests/bootstrap.php only when the real class is absent — inside a
 * server, the real one always wins.
 *
 * Only `addDefaultPolicy()` is mirrored, since that is all the event calls; the policies
 * are kept so a test can read back what a listener contributed.
 */

namespace OC\Security\CSP;

use OCP\AppFramework\Http\EmptyContentSecurityPolicy;

class ContentSecurityPolicyManager
{
    /** @var list<EmptyContentSecurityPolicy> */
    public array $policies = [];

    public function addDefaultPolicy(EmptyContentSecurityPolicy $policy): void
    {
        $this->policies[] = $policy;
    }
}
