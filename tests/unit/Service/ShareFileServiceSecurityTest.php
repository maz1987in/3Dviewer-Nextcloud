<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use DateTime;
use OCA\ThreeDViewer\Service\ModelDependencyResolver;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\ShareFileService;
use OCP\Files\File;
use OCP\Files\NotFoundException;
use OCP\Share\Exceptions\ShareNotFound;
use OCP\Share\IManager;
use OCP\Share\IShare;
use PHPUnit\Framework\TestCase;

/**
 * Access-control tests for the anonymous share path.
 *
 * `getShareByToken()` returns a share whenever the token matches — it says nothing
 * about whether the caller is *allowed* to read it. Resolving a file from a token
 * alone therefore hands out the contents of password-protected, expired, and
 * non-link shares to anyone holding the token.
 */
class ShareFileServiceSecurityTest extends TestCase
{
    protected function setUp(): void
    {
        if (!interface_exists(IManager::class)) {
            $this->markTestSkipped('Share interfaces not available');
        }
    }

    public function testExpiredShareIsRejected(): void
    {
        $service = $this->serviceForShare($this->share(expiration: new DateTime('2020-01-01T00:00:00Z')));

        $this->expectException(NotFoundException::class);
        $service->getFileFromShare('token', null);
    }

    public function testShareExpiringInTheFutureIsAccepted(): void
    {
        $service = $this->serviceForShare($this->share(expiration: new DateTime('2999-01-01T00:00:00Z')));

        $this->assertInstanceOf(File::class, $service->getFileFromShare('token', null));
    }

    public function testNonLinkShareIsRejected(): void
    {
        // A user-to-user share has a token too, but it is not public.
        $service = $this->serviceForShare($this->share(shareType: IShare::TYPE_USER));

        $this->expectException(NotFoundException::class);
        $service->getFileFromShare('token', null);
    }

    public function testFindValidLinkShareReturnsNullForExpiredShare(): void
    {
        $service = $this->serviceForShare($this->share(expiration: new DateTime('2020-01-01T00:00:00Z')));

        $this->assertNull($service->findValidLinkShare('token'));
    }

    /**
     * The share manager rejects expired shares by throwing, not by returning a share
     * with a past expiry — so the expiration check below never sees them. Left
     * uncaught this surfaces as a 500 instead of a 404.
     */
    public function testShareManagerThrowingIsTreatedAsNoShare(): void
    {
        $shareManager = $this->createMock(IManager::class);
        $shareManager->method('getShareByToken')->willThrowException(new ShareNotFound('expired'));
        $service = new ShareFileService($shareManager, $this->createMock(ModelFileSupport::class), new ModelDependencyResolver());

        $this->assertNull($service->findValidLinkShare('expired-token'));
    }

    public function testShareManagerThrowingSurfacesAsNotFoundNotAServerError(): void
    {
        $shareManager = $this->createMock(IManager::class);
        $shareManager->method('getShareByToken')->willThrowException(new ShareNotFound('expired'));
        $service = new ShareFileService($shareManager, $this->createMock(ModelFileSupport::class), new ModelDependencyResolver());

        $this->expectException(NotFoundException::class);
        $service->getFileFromShare('expired-token', null);
    }

    public function testFindValidLinkShareReturnsNullForUnknownToken(): void
    {
        // Nextcloud 33 narrowed IManager::getShareByToken() to a non-nullable IShare,
        // so PHPUnit refuses to stub a null return there. The production null check
        // stays for the 31/32 range this app still supports; the "no share" path on
        // newer servers is covered by the ShareNotFound tests instead.
        $returnType = (new \ReflectionMethod(IManager::class, 'getShareByToken'))->getReturnType();
        if ($returnType !== null && !$returnType->allowsNull()) {
            $this->markTestSkipped('getShareByToken is non-nullable on this Nextcloud version');
        }

        $shareManager = $this->createMock(IManager::class);
        $shareManager->method('getShareByToken')->willReturn(null);
        $service = new ShareFileService($shareManager, $this->createMock(ModelFileSupport::class), new ModelDependencyResolver());

        $this->assertNull($service->findValidLinkShare('nope'));
    }

    public function testFindValidLinkShareExposesPasswordForAuthorisationChecks(): void
    {
        $service = $this->serviceForShare($this->share(password: 'hashed-password'));

        $share = $service->findValidLinkShare('token');

        $this->assertNotNull($share);
        $this->assertSame('hashed-password', $share->getPassword());
    }

    /**
     * The service resolves files; deciding whether the caller satisfied the share's
     * password is the controller's job, so a valid password-protected share must
     * still resolve here rather than being silently dropped.
     */
    public function testPasswordProtectedShareStillResolvesAtServiceLevel(): void
    {
        $service = $this->serviceForShare($this->share(password: 'hashed-password'));

        $this->assertInstanceOf(File::class, $service->getFileFromShare('token', null));
    }

    /**
     * The dependency route is the one place a name — rather than a file id — picks the
     * file, so it must clear the same share gate as everything else before the
     * declaration check ever runs.
     */
    public function testDependencyLookupIsGatedByTheShareCheck(): void
    {
        $service = $this->serviceForShare($this->share(shareType: IShare::TYPE_USER));

        $this->expectException(NotFoundException::class);
        $service->getDependencyFromShare('token', 1, 'wood.png');
    }

    public function testExpiredShareServesNoDependencies(): void
    {
        $service = $this->serviceForShare($this->share(expiration: new DateTime('2020-01-01T00:00:00Z')));

        $this->expectException(NotFoundException::class);
        $service->getDependencyFromShare('token', 1, 'wood.png');
    }

    private function serviceForShare(IShare $share): ShareFileService
    {
        $shareManager = $this->createMock(IManager::class);
        $shareManager->method('getShareByToken')->willReturn($share);

        $support = $this->createMock(ModelFileSupport::class);
        $support->method('isSupported')->willReturn(true);

        return new ShareFileService($shareManager, $support, new ModelDependencyResolver());
    }

    private function share(
        ?DateTime $expiration = null,
        int $shareType = IShare::TYPE_LINK,
        ?string $password = null,
    ): IShare {
        $file = $this->createMock(File::class);
        $file->method('getExtension')->willReturn('stl');

        $share = $this->createMock(IShare::class);
        $share->method('getNode')->willReturn($file);
        $share->method('getExpirationDate')->willReturn($expiration);
        $share->method('getShareType')->willReturn($shareType);
        $share->method('getPassword')->willReturn($password);

        return $share;
    }
}
