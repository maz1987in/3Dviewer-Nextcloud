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
 * Lets the viewer compile WebAssembly wherever it is opened.
 *
 * The viewer runs inside the Files app and on public share pages, whose policy the
 * server builds, so nothing set on this app's own responses reaches them. The OCCT, IFC
 * and Rhino loaders are WebAssembly, which a policy without `'wasm-unsafe-eval'` refuses
 * to compile.
 *
 * This is deliberately an `EmptyContentSecurityPolicy` handed to the additive event. The
 * listener removed in a37d470 put a full `ContentSecurityPolicy` on the response, which
 * replaced what other apps had set and broke them. An empty policy carries no sources of
 * its own, so merging it changes one thing on the page: WebAssembly may compile.
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
        $event->addPolicy($policy);
    }
}
