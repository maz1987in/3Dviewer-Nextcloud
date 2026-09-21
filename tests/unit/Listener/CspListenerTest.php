<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Listener;

use OC\Security\CSP\ContentSecurityPolicyManager;
use OCA\ThreeDViewer\Listener\CspListener;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\EmptyContentSecurityPolicy;
use OCP\EventDispatcher\Event;
use OCP\Security\CSP\AddContentSecurityPolicyEvent;
use PHPUnit\Framework\TestCase;

/**
 * No page the viewer runs on let it compile WebAssembly (issue #169).
 *
 * The viewer opens inside the Files app, whose Content Security Policy belongs to the
 * server, so the policy set on the app's own routes never applied there — and even those
 * routes never asked for `wasm-unsafe-eval`. Every WASM-backed format (STEP, IGES, BREP,
 * FCSTD, IFC, 3DM) failed at `WebAssembly.instantiate()`.
 *
 * The earlier global listener was removed for breaking other apps: it *replaced* the
 * response's policy. These tests pin the two things that make this one safe — it only
 * contributes through the additive event, and it contributes nothing beyond WebAssembly.
 */
class CspListenerTest extends TestCase
{
    protected function setUp(): void
    {
        // Inside a full server the real manager needs the DI container; the listener is
        // exercised there by the live-container checks instead.
        if (!property_exists(ContentSecurityPolicyManager::class, 'policies')) {
            $this->markTestSkipped('real ContentSecurityPolicyManager present');
        }
    }

    public function testAllowsWebAssemblyCompilation(): void
    {
        $manager = new ContentSecurityPolicyManager();

        (new CspListener())->handle(new AddContentSecurityPolicyEvent($manager));

        $this->assertCount(1, $manager->policies);
        $this->assertStringContainsString("'wasm-unsafe-eval'", $manager->policies[0]->buildPolicy());
    }

    public function testNeverAsksForJavaScriptEval(): void
    {
        $manager = new ContentSecurityPolicyManager();

        (new CspListener())->handle(new AddContentSecurityPolicyEvent($manager));

        // `'unsafe-eval'` as a whole token; `'wasm-unsafe-eval'` contains it as a substring.
        $this->assertDoesNotMatchRegularExpression("/(?<![-\w])'unsafe-eval'/", $manager->policies[0]->buildPolicy());
    }

    public function testContributesNothingBeyondWebAssembly(): void
    {
        $manager = new ContentSecurityPolicyManager();

        (new CspListener())->handle(new AddContentSecurityPolicyEvent($manager));

        // Take the script-src directive out and what is left must be what an untouched
        // empty policy builds: no sources, so merging it into another app's page cannot
        // loosen or tighten anything else there.
        $built = $manager->policies[0]->buildPolicy();
        $this->assertMatchesRegularExpression("/script-src\s+'wasm-unsafe-eval';/", $built);
        $this->assertSame(
            (new EmptyContentSecurityPolicy())->buildPolicy(),
            preg_replace("/script-src\s+'wasm-unsafe-eval';/", '', $built),
        );
    }

    public function testIgnoresOtherEvents(): void
    {
        $this->expectNotToPerformAssertions();

        (new CspListener())->handle(new Event());
    }

    public function testPolicyIsNotAFullDefaultPolicy(): void
    {
        $manager = new ContentSecurityPolicyManager();

        (new CspListener())->handle(new AddContentSecurityPolicyEvent($manager));

        // A `ContentSecurityPolicy` carries the server defaults ('self' sources, inline
        // styles…) and would add all of them to every page it is merged into.
        $this->assertNotInstanceOf(ContentSecurityPolicy::class, $manager->policies[0]);
    }
}
