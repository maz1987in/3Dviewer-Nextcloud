<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Controller;

use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\Attribute\Route;
use OCP\AppFramework\PublicShareController;
use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use ReflectionClass;
use ReflectionMethod;

/**
 * Guard for every anonymous route the app exposes.
 *
 * GHSA-gjh8-x4wm-3cfj / CVE-2026-104189: a `#[PublicPage]` controller that took a share
 * `{token}` but extended plain Controller served password-protected shares to anyone who
 * held the token, because PublicShareMiddleware enforces share passwords only for
 * instances of PublicShareController. PublicFileControllerAuthTest pins that for one
 * class; this test pins it for the whole of lib/Controller, so a new controller, or a
 * new public method on the wrong class, fails here instead of shipping.
 *
 * Controllers are found by scanning lib/Controller and the routes by reflecting on the
 * route attributes (plus appinfo/routes.php), so nothing here is a hand-kept list of
 * what exists. The one list is {@see self::TOKENLESS_PUBLIC_METHODS}, and it is a list
 * of exceptions that must each be justified.
 */
class PublicRouteGuardTest extends TestCase
{
    /**
     * `#[PublicPage]` methods that take no share token, and why each is safe without one.
     * Anything not listed fails Rule B. Adding to this list is a security decision: say
     * what the method serves and why that needs no share.
     *
     * Keys are `ShortClassName::method`.
     *
     * @var array<string, string>
     */
    private const TOKENLESS_PUBLIC_METHODS = [
        // Empty on purpose: the app has no anonymous route that needs no share. An entry
        // goes here as `'ShortClassName::method' => 'why it is safe', ` with a comment
        // above it saying what the method serves and why no share is needed.
    ];

    /**
     * Routes that change data and may skip the CSRF check, and why. A write without the
     * check can be triggered by any page the signed-in user visits, so the only honest
     * reason is that there is no session to ride on: a share-authenticated endpoint
     * (`#[PublicPage]` on a PublicShareController), which a share token and password
     * protect instead. A listed method that is not that still fails Rule D.
     *
     * Empty on purpose: every write in the app is signed-in only and checks the token,
     * and the public routes only read. Entries are `'ShortClassName::method' => 'why'`.
     *
     * @var array<string, string>
     */
    private const CSRF_EXEMPT_WRITES = [
    ];

    private const REQUIRED_SHARE_METHODS = ['isValidToken', 'isPasswordProtected', 'getPasswordHash'];

    private const APP_NAMESPACE = 'OCA\\ThreeDViewer\\Controller\\';

    /** @var list<array{class: class-string, method: string, public: bool, noCsrf: bool, routes: list<string>, takesToken: bool, extendsShare: bool}>|null */
    private static ?array $methods = null;

    protected function setUp(): void
    {
        if (!class_exists(PublicShareController::class)) {
            $this->markTestSkipped('OCP is not available');
        }
    }

    public function testTheScanActuallyFindsTheAnonymousRoutes(): void
    {
        // A scan that silently finds nothing would pass every rule below.
        $public = array_filter(self::methods(), static fn (array $m): bool => $m['public']);
        $tokenised = array_filter($public, static fn (array $m): bool => $m['takesToken']);

        $this->assertNotEmpty(self::controllerClasses(), 'no controllers found under lib/Controller');
        $this->assertNotEmpty($public, 'no #[PublicPage] methods found; the attribute scan is broken');
        $this->assertNotEmpty($tokenised, 'no #[PublicPage] method was recognised as taking a token; token detection is broken');
    }

    /**
     * Rule A. A public method that takes a share token must live on a
     * PublicShareController, or the middleware never checks the share password.
     */
    public function testEveryPublicMethodThatTakesAShareTokenIsOnAPublicShareController(): void
    {
        $offenders = [];
        foreach (self::methods() as $m) {
            if ($m['public'] && $m['takesToken'] && !$m['extendsShare']) {
                $offenders[] = $this->label($m);
            }
        }

        $this->assertSame(
            [],
            $offenders,
            'These #[PublicPage] methods take a share token but their class does not extend '
            . 'OCP\\AppFramework\\PublicShareController, so PublicShareMiddleware will not enforce the '
            . 'share password and anyone holding the token can read a password-protected share '
            . '(GHSA-gjh8-x4wm-3cfj): ' . implode(', ', $offenders)
        );
    }

    /**
     * Rule B. A public method with no token has no share to authorise against, so each
     * one has to be a reviewed exception.
     */
    public function testEveryTokenlessPublicMethodIsOnTheReviewedAllowlist(): void
    {
        $offenders = [];
        foreach (self::methods() as $m) {
            if ($m['public'] && !$m['takesToken'] && !isset(self::TOKENLESS_PUBLIC_METHODS[$this->key($m)])) {
                $offenders[] = $this->label($m);
            }
        }

        $this->assertSame(
            [],
            $offenders,
            'These #[PublicPage] methods take no share token and are not on TOKENLESS_PUBLIC_METHODS. '
            . 'Anonymous callers can reach them with no authorisation at all. Either make them '
            . 'authenticated, give them a share to check, or add them to the allowlist with a reason '
            . 'they are safe: ' . implode(', ', $offenders)
        );
    }

    public function testTheAllowlistHasNoStaleEntries(): void
    {
        $live = [];
        foreach (self::methods() as $m) {
            if ($m['public'] && !$m['takesToken']) {
                $live[$this->key($m)] = true;
            }
        }

        $stale = array_values(array_diff(array_keys(self::TOKENLESS_PUBLIC_METHODS), array_keys($live)));

        $this->assertSame(
            [],
            $stale,
            'TOKENLESS_PUBLIC_METHODS lists methods that are no longer public and tokenless; '
            . 'remove them so the list stays an exact record: ' . implode(', ', $stale)
        );
    }

    /**
     * A `#[PublicPage]` method with no route is unreachable today, but it is anonymous
     * code nobody reviewed, one routes.php edit away from being live.
     */
    public function testEveryPublicMethodIsRouted(): void
    {
        $offenders = [];
        foreach (self::methods() as $m) {
            if ($m['public'] && $m['routes'] === []) {
                $offenders[] = $this->label($m);
            }
        }

        $this->assertSame(
            [],
            $offenders,
            'These #[PublicPage] methods have no route attribute and no appinfo/routes.php entry. '
            . 'Delete them or route them; unrouted anonymous code is not reviewed: ' . implode(', ', $offenders)
        );
    }

    /**
     * Rule C. Extending PublicShareController is only worth anything if the class says
     * how its share is validated. Inheriting the abstract signature is not enough, and
     * a literal `return true/false/null` is a stub that lets everyone in.
     */
    public function testEveryPublicShareControllerImplementsShareValidationAgainstTheShare(): void
    {
        $offenders = [];
        foreach (self::controllerClasses() as $class) {
            $reflection = new ReflectionClass($class);
            if ($reflection->isAbstract() || !$reflection->isSubclassOf(PublicShareController::class)) {
                continue;
            }

            foreach (self::REQUIRED_SHARE_METHODS as $name) {
                if (!$reflection->hasMethod($name)) {
                    $offenders[] = $reflection->getShortName() . '::' . $name . ' (missing)';
                    continue;
                }
                $method = $reflection->getMethod($name);
                if ($method->getDeclaringClass()->getName() !== $class) {
                    $offenders[] = $reflection->getShortName() . '::' . $name . ' (only inherited)';
                } elseif (self::isLiteralStub($method)) {
                    $offenders[] = $reflection->getShortName() . '::' . $name . ' (returns a literal, not the share)';
                }
            }
        }

        $this->assertSame(
            [],
            $offenders,
            'PublicShareController subclasses must implement isValidToken, isPasswordProtected and '
            . 'getPasswordHash themselves, against the share: ' . implode(', ', $offenders)
        );
    }

    /**
     * Not a rule the advisory needed, but the one that lets a reader trust the table:
     * the same anonymous methods must never be reachable by a state-changing verb, since
     * #[NoCSRFRequired] on a public route removes the only request-forgery check.
     */
    public function testNoPublicMethodIsRoutedForAStateChangingVerb(): void
    {
        $offenders = [];
        foreach (self::methods() as $m) {
            if (!$m['public']) {
                continue;
            }
            foreach ($m['routes'] as $route) {
                [$verb] = explode(' ', $route, 2);
                if (!in_array($verb, ['GET', 'HEAD', 'OPTIONS'], true)) {
                    $offenders[] = $this->label($m) . ' [' . $route . ']';
                }
            }
        }

        $this->assertSame(
            [],
            $offenders,
            'Anonymous routes must be read-only; these accept a verb that writes: ' . implode(', ', $offenders)
        );
    }

    /**
     * Rule D. #[NoCSRFRequired] on a route that changes data lets any page the signed-in
     * user visits trigger it: the browser sends the session cookie and nothing else is
     * checked. Browser defaults (SameSite cookies, the preflight a PUT or DELETE needs)
     * stop most of that, not all of it, so a write has to carry the token like the rest
     * of Nextcloud. The one exception is a share-authenticated endpoint, which has no
     * session to ride on and must be listed in CSRF_EXEMPT_WRITES with a reason.
     */
    public function testNoRouteThatChangesDataSkipsTheCsrfCheck(): void
    {
        $offenders = [];
        foreach (self::methods() as $m) {
            if (!$m['noCsrf']) {
                continue;
            }
            foreach ($m['routes'] as $route) {
                [$verb] = explode(' ', $route, 2);
                if (in_array($verb, ['GET', 'HEAD', 'OPTIONS'], true)) {
                    continue;
                }
                $exempt = isset(self::CSRF_EXEMPT_WRITES[$this->key($m)]) && $m['public'] && $m['extendsShare'];
                if (!$exempt) {
                    $offenders[] = $this->label($m) . ' [' . $route . ']';
                }
            }
        }

        $this->assertSame(
            [],
            $offenders,
            'These routes change data but carry #[NoCSRFRequired], so another site can trigger them while '
            . 'the user is signed in. Remove the attribute and send the request token from the caller '
            . '(@nextcloud/axios does); only a #[PublicPage] route on a PublicShareController may be listed in '
            . 'CSRF_EXEMPT_WRITES: ' . implode(', ', $offenders)
        );
    }

    public function testTheCsrfAllowlistHasNoStaleEntries(): void
    {
        $live = [];
        foreach (self::methods() as $m) {
            if ($m['noCsrf'] && $m['public'] && $m['extendsShare']) {
                $live[$this->key($m)] = true;
            }
        }

        $stale = array_values(array_diff(array_keys(self::CSRF_EXEMPT_WRITES), array_keys($live)));

        $this->assertSame(
            [],
            $stale,
            'CSRF_EXEMPT_WRITES lists methods that are not share-authenticated and CSRF-exempt; remove them '
            . 'so the list stays an exact record: ' . implode(', ', $stale)
        );
    }

    // ---------------------------------------------------------------------------------
    // Scanning
    // ---------------------------------------------------------------------------------

    /**
     * @return list<class-string>
     */
    private static function controllerClasses(): array
    {
        $root = dirname(__DIR__, 3) . '/lib/Controller';
        $classes = [];

        $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, RecursiveDirectoryIterator::SKIP_DOTS));
        foreach ($files as $file) {
            if ($file->getExtension() !== 'php') {
                continue;
            }
            $relative = substr($file->getPathname(), strlen($root) + 1, -strlen('.php'));
            /** @var class-string $class */
            $class = self::APP_NAMESPACE . str_replace('/', '\\', $relative);
            if (!class_exists($class)) {
                throw new \LogicException("lib/Controller/{$relative}.php does not declare {$class}; the guard cannot inspect it");
            }
            $classes[] = $class;
        }
        sort($classes);

        return $classes;
    }

    /**
     * @return list<array{class: class-string, method: string, public: bool, noCsrf: bool, routes: list<string>, takesToken: bool, extendsShare: bool}>
     */
    private static function methods(): array
    {
        if (self::$methods !== null) {
            return self::$methods;
        }

        $fromRoutesFile = self::routesFromRoutesFile();
        $found = [];

        foreach (self::controllerClasses() as $class) {
            $reflection = new ReflectionClass($class);
            // An abstract controller is only reachable through its concrete subclasses,
            // which are scanned with the inherited methods included.
            if ($reflection->isAbstract()) {
                continue;
            }

            $classIsPublic = self::hasPublicPage($reflection);
            foreach ($reflection->getMethods(ReflectionMethod::IS_PUBLIC) as $method) {
                if ($method->isConstructor() || $method->isStatic()) {
                    continue;
                }
                // Methods the framework base classes define are not this app's routes.
                if (!str_starts_with($method->getDeclaringClass()->getName(), self::APP_NAMESPACE)) {
                    continue;
                }

                $routes = [];
                $placeholders = [];
                foreach ($method->getAttributes(Route::class, \ReflectionAttribute::IS_INSTANCEOF) as $attribute) {
                    $route = $attribute->newInstance();
                    $data = $route->toArray();
                    $routes[] = strtoupper((string) $data['verb']) . ' ' . $data['url'];
                    $placeholders = array_merge($placeholders, self::placeholders((string) $data['url']));
                }
                foreach ($fromRoutesFile[$class][$method->getName()] ?? [] as $entry) {
                    $routes[] = $entry['verb'] . ' ' . $entry['url'];
                    $placeholders = array_merge($placeholders, self::placeholders($entry['url']));
                }

                $names = $placeholders;
                foreach ($method->getParameters() as $parameter) {
                    $names[] = $parameter->getName();
                }

                $found[] = [
                    'class' => $class,
                    'method' => $method->getName(),
                    'public' => $classIsPublic || self::hasPublicPage($method),
                    'noCsrf' => self::hasNoCsrfRequired($reflection) || self::hasNoCsrfRequired($method),
                    'routes' => array_values(array_unique($routes)),
                    // Both the route and the signature count, so renaming either one
                    // cannot hide a token from the guard. "Contains token" also catches
                    // shareToken, share_token and linkToken.
                    'takesToken' => array_filter($names, static fn (string $n): bool => stripos($n, 'token') !== false) !== [],
                    'extendsShare' => $reflection->isSubclassOf(PublicShareController::class),
                ];
            }
        }

        return self::$methods = $found;
    }

    /**
     * #[PublicPage] on the method or the class, or the deprecated `@PublicPage`
     * annotation Nextcloud still honours on the servers this app supports.
     */
    private static function hasPublicPage(ReflectionClass|ReflectionMethod $target): bool
    {
        if ($target->getAttributes(PublicPage::class) !== []) {
            return true;
        }

        return preg_match('/@PublicPage\b/', (string) $target->getDocComment()) === 1;
    }

    /**
     * #[NoCSRFRequired] or the deprecated `@NoCSRFRequired` annotation.
     */
    private static function hasNoCsrfRequired(ReflectionClass|ReflectionMethod $target): bool
    {
        if ($target->getAttributes(NoCSRFRequired::class) !== []) {
            return true;
        }

        return preg_match('/@NoCSRFRequired\b/', (string) $target->getDocComment()) === 1;
    }

    /**
     * @return list<string>
     */
    private static function placeholders(string $url): array
    {
        preg_match_all('/\{(\w+)\}/', $url, $matches);

        return $matches[1];
    }

    /**
     * Entries of appinfo/routes.php, as [class => [method => [[verb, url], ...]]].
     * Nextcloud turns `settings#get_settings` into SettingsController::getSettings.
     *
     * @return array<class-string, array<string, list<array{verb: string, url: string}>>>
     */
    private static function routesFromRoutesFile(): array
    {
        /** @var array{routes?: list<array{name: string, url: string, verb?: string}>, ocs?: list<array{name: string, url: string, verb?: string}>} $config */
        $config = require dirname(__DIR__, 3) . '/appinfo/routes.php';

        $byClass = [];
        foreach (array_merge($config['routes'] ?? [], $config['ocs'] ?? []) as $route) {
            [$controller, $action] = explode('#', $route['name'], 2);
            $class = self::APP_NAMESPACE . str_replace(' ', '', ucwords(str_replace('_', ' ', $controller))) . 'Controller';
            $method = lcfirst(str_replace(' ', '', ucwords(str_replace('_', ' ', $action))));
            $byClass[$class][$method][] = [
                'verb' => strtoupper($route['verb'] ?? 'GET'),
                'url' => $route['url'],
            ];
        }

        return $byClass;
    }

    private static function isLiteralStub(ReflectionMethod $method): bool
    {
        $file = $method->getFileName();
        if ($file === false) {
            return false;
        }

        $lines = array_slice((array) file($file), $method->getStartLine() - 1, $method->getEndLine() - $method->getStartLine() + 1);
        $source = implode('', $lines);
        $open = strpos($source, '{');
        $close = strrpos($source, '}');
        if ($open === false || $close === false) {
            return false;
        }
        $body = trim(substr($source, $open + 1, $close - $open - 1));

        return preg_match('/^return\s+(true|false|null|\'\'|"")\s*;$/i', $body) === 1;
    }

    /**
     * @param array{class: class-string, method: string} $m
     */
    private function key(array $m): string
    {
        return (new ReflectionClass($m['class']))->getShortName() . '::' . $m['method'];
    }

    /**
     * @param array{class: class-string, method: string} $m
     */
    private function label(array $m): string
    {
        return $m['class'] . '::' . $m['method'];
    }
}
