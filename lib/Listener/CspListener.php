<?php

declare(strict_types=1);

/**
 * @copyright Copyright (c) 2026
 * @license AGPL-3.0-or-later
 */

namespace OCA\ThreeDViewer\Listener;

use OCP\AppFramework\Http\EmptyContentSecurityPolicy;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Security\CSP\AddContentSecurityPolicyEvent;

/**
 * Lets the viewer compile WebAssembly, and start its own workers, wherever it is opened.
 *
 * The viewer runs inside the Files app and on public share pages, whose policy the
 * server builds, so nothing set on this app's own responses reaches them. The OCCT, IFC
 * and Rhino loaders are WebAssembly, which a policy without `'wasm-unsafe-eval'` refuses
 * to compile.
 *
 * This is deliberately an `EmptyContentSecurityPolicy` handed to the additive event. The
 * listener removed in a37d470 put a full `ContentSecurityPolicy` on the response, which
 * replaced what other apps had set and broke them. An empty policy carries no sources of
 * its own, so merging it changes two things on the page: WebAssembly may compile, and
 * workers may be started from this server's own scripts and from blob: URLs.
 * `'wasm-unsafe-eval'` does not permit `eval()` or `new Function`.
 *
 * @template-implements IEventListener<AddContentSecurityPolicyEvent>
 */
class CspListener implements IEventListener
{
    public function handle(Event $event): void
    {
        if (!$event instanceof AddContentSecurityPolicyEvent) {
            return;
        }

        $policy = new EmptyContentSecurityPolicy();
        $policy->allowEvalWasm(true);
        // Scans are read in a worker from the app's own files (src/pointclouds/). A share
        // page's policy has no worker-src, so the nonce-only script-src would refuse it.
        // Same-origin only. Starting a worker takes script already running on the page,
        // which script-src's nonces still decide, so this lets no new script run.
        $policy->addAllowedWorkerSrcDomain("'self'");
        // Splats are drawn by Spark (src/splats/), which starts its sort and parse workers
        // from blob: URLs. Only script already on the page can make one, likewise.
        $policy->addAllowedWorkerSrcDomain('blob:');
        $event->addPolicy($policy);
    }
}
