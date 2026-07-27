<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\ResponseBuilder;
use PHPUnit\Framework\TestCase;

/**
 * Regression tests for the Content Security Policy builder.
 *
 * Nextcloud 34 removed `addAllowedChildSrcDomain()` from
 * `OCP\AppFramework\Http\EmptyContentSecurityPolicy`, so calling it fatals every
 * request that serves a model or renders the viewer page. Composer pins
 * `nextcloud/ocp` to an older branch where the method still exists, which means a
 * test written against the vendored CSP class would happily pass with the broken
 * call. These tests therefore drive `addCspHeaders()` against a recorder that
 * mirrors the NC 34 API surface exactly and — by defining no `__call()` fallback —
 * raises the same `Error` production did for anything outside that surface.
 */
class ResponseBuilderCspTest extends TestCase
{
    public function testAddCspHeadersOnlyCallsMethodsPresentInNextcloud34(): void
    {
        $csp = $this->createNc34CspRecorder();
        $response = $this->createResponseDouble($csp);

        (new ResponseBuilder(new ModelFileSupport()))->addCspHeaders($response);

        $this->assertSame($csp, $response->csp, 'The policy must be written back onto the response');
    }

    public function testAddCspHeadersAllowsBlobWorkersViaWorkerSrc(): void
    {
        $csp = $this->createNc34CspRecorder();
        $response = $this->createResponseDouble($csp);

        (new ResponseBuilder(new ModelFileSupport()))->addCspHeaders($response);

        // DRACO, KTX2 and web-ifc all spin up workers from blob: URLs.
        $this->assertContains(['worker', 'blob:'], $csp->calls);
    }

    public function testAddCspHeadersAllowsBlobAndDataForGltfBuffersAndTextures(): void
    {
        $csp = $this->createNc34CspRecorder();
        $response = $this->createResponseDouble($csp);

        (new ResponseBuilder(new ModelFileSupport()))->addCspHeaders($response);

        $this->assertContains(['connect', 'blob:'], $csp->calls);
        $this->assertContains(['connect', 'data:'], $csp->calls);
        $this->assertContains(['image', 'blob:'], $csp->calls);
        $this->assertContains(['image', 'data:'], $csp->calls);
        $this->assertContains(['script', 'blob:'], $csp->calls);
    }

    /**
     * A stand-in for EmptyContentSecurityPolicy exposing only the domain-allowing
     * methods that still exist in Nextcloud 34. Deliberately has no `__call()`, so
     * a removed method such as `addAllowedChildSrcDomain()` fails exactly the way
     * it does on a real server.
     */
    private function createNc34CspRecorder(): object
    {
        return new class {
            /** @var list<array{0: string, 1: string}> */
            public array $calls = [];

            public function addAllowedConnectDomain(string $domain): void
            {
                $this->calls[] = ['connect', $domain];
            }

            public function addAllowedImageDomain(string $domain): void
            {
                $this->calls[] = ['image', $domain];
            }

            public function addAllowedScriptDomain(string $domain): void
            {
                $this->calls[] = ['script', $domain];
            }

            public function addAllowedMediaDomain(string $domain): void
            {
                $this->calls[] = ['media', $domain];
            }

            public function addAllowedFontDomain(string $domain): void
            {
                $this->calls[] = ['font', $domain];
            }

            public function addAllowedStyleDomain(string $domain): void
            {
                $this->calls[] = ['style', $domain];
            }

            public function addAllowedFrameDomain(string $domain): void
            {
                $this->calls[] = ['frame', $domain];
            }

            public function addAllowedWorkerSrcDomain(string $domain): void
            {
                $this->calls[] = ['worker', $domain];
            }
        };
    }

    private function createResponseDouble(object $csp): object
    {
        return new class ($csp) {
            public function __construct(public object $csp)
            {
            }

            public function getContentSecurityPolicy(): object
            {
                return $this->csp;
            }

            public function setContentSecurityPolicy(object $csp): void
            {
                $this->csp = $csp;
            }
        };
    }
}
