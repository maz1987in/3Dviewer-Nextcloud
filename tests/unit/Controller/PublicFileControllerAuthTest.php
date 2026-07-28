<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Controller;

use DateTime;
use OCA\ThreeDViewer\Controller\PublicFileController;
use OCA\ThreeDViewer\Service\ModelDependencyResolver;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\PathLocator;
use OCA\ThreeDViewer\Service\ShareFileService;
use OCP\AppFramework\PublicShareController;
use OCP\Files\File;
use OCP\IRequest;
use OCP\ISession;
use OCP\Share\IManager;
use OCP\Share\IShare;
use PHPUnit\Framework\TestCase;

/**
 * Authorisation tests for anonymous 3D file streaming.
 *
 * Nextcloud only enforces share passwords for controllers that extend
 * PublicShareController — PublicShareMiddleware returns early for anything else.
 * A plain Controller with #[PublicPage] therefore serves password-protected
 * shares to anyone holding the token, which is exactly what the password is
 * meant to prevent.
 */
class PublicFileControllerAuthTest extends TestCase
{
    protected function setUp(): void
    {
        if (!interface_exists(IManager::class) || !class_exists(PublicShareController::class)) {
            $this->markTestSkipped('Share interfaces not available');
        }
    }

    public function testExtendsPublicShareControllerSoTheMiddlewareEnforcesAuth(): void
    {
        $this->assertInstanceOf(
            PublicShareController::class,
            $this->controller($this->share()),
            'PublicShareMiddleware skips controllers that are not PublicShareController instances'
        );
    }

    public function testPasswordProtectedShareIsNotAuthenticatedWithoutSession(): void
    {
        $controller = $this->controller($this->share(password: 'hashed-password'));
        $controller->setToken('token');

        $this->assertFalse($controller->isAuthenticated());
    }

    public function testShareWithoutPasswordIsAuthenticated(): void
    {
        $controller = $this->controller($this->share());
        $controller->setToken('token');

        $this->assertTrue($controller->isAuthenticated());
    }

    public function testPasswordProtectedShareIsAuthenticatedWhenSessionHoldsMatchingHash(): void
    {
        $controller = $this->controller(
            $this->share(password: 'hashed-password'),
            session: json_encode(['token' => 'hashed-password'])
        );
        $controller->setToken('token');

        $this->assertTrue($controller->isAuthenticated());
    }

    public function testSessionHashForADifferentTokenDoesNotAuthenticate(): void
    {
        $controller = $this->controller(
            $this->share(password: 'hashed-password'),
            session: json_encode(['some-other-token' => 'hashed-password'])
        );
        $controller->setToken('token');

        $this->assertFalse($controller->isAuthenticated());
    }

    public function testStaleSessionHashDoesNotAuthenticateAfterPasswordChange(): void
    {
        $controller = $this->controller(
            $this->share(password: 'new-password-hash'),
            session: json_encode(['token' => 'old-password-hash'])
        );
        $controller->setToken('token');

        $this->assertFalse($controller->isAuthenticated());
    }

    public function testValidLinkShareTokenIsValid(): void
    {
        $controller = $this->controller($this->share());
        $controller->setToken('token');

        $this->assertTrue($controller->isValidToken());
    }

    public function testUnknownTokenIsNotValid(): void
    {
        // Nextcloud 33 narrowed IManager::getShareByToken() to a non-nullable IShare,
        // so PHPUnit refuses to stub a null return there. The production null check
        // stays for the 31/32 range this app still supports; the "no share" path on
        // newer servers is covered by the ShareNotFound tests instead.
        $returnType = (new \ReflectionMethod(IManager::class, 'getShareByToken'))->getReturnType();
        if ($returnType !== null && !$returnType->allowsNull()) {
            $this->markTestSkipped('getShareByToken is non-nullable on this Nextcloud version');
        }

        $controller = $this->controller(null);
        $controller->setToken('nope');

        $this->assertFalse($controller->isValidToken());
    }

    public function testExpiredShareTokenIsNotValid(): void
    {
        $controller = $this->controller($this->share(expiration: new DateTime('2020-01-01T00:00:00Z')));
        $controller->setToken('token');

        $this->assertFalse($controller->isValidToken());
    }

    private function controller(?IShare $share, string $session = '[]'): PublicFileController
    {
        $shareManager = $this->createMock(IManager::class);
        $shareManager->method('getShareByToken')->willReturn($share);

        $support = $this->createMock(ModelFileSupport::class);
        $support->method('isSupported')->willReturn(true);

        $sessionMock = $this->createMock(ISession::class);
        $sessionMock->method('get')->willReturn($session);

        return new PublicFileController(
            'threedviewer',
            $this->createMock(IRequest::class),
            $sessionMock,
            new ShareFileService($shareManager, $support, new ModelDependencyResolver(new PathLocator())),
            $support,
        );
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
