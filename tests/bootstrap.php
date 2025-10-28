<?php

declare(strict_types=1);

// Attempt to include Nextcloud server test bootstrap if running inside a full server dev tree.
$possibleCoreBootstrap = __DIR__ . '/../../../tests/bootstrap.php';
if (file_exists($possibleCoreBootstrap)) {
    require_once $possibleCoreBootstrap;
}

// Autoload app + vendor (composer-bin plugin keeps vendor in root)
require_once __DIR__ . '/../vendor/autoload.php';

// Only call server runtime helpers if available (running inside full Nextcloud instance)
if (class_exists('OC_App')) {
    \OC_App::loadApp(OCA\ThreeDViewer\AppInfo\Application::APP_ID);
}
if (class_exists('OC_Hook')) {
    \OC_Hook::clear();
}

// Provide a fallback autoloader for OCP public API (nextcloud/ocp package ships sources without composer autoload section)
if (!interface_exists('OCP\\IRequest')) {
    spl_autoload_register(static function (string $class): void {
        if (str_starts_with($class, 'OCP\\')) {
            $relative = str_replace('\\', '/', $class) . '.php';
            $base = __DIR__ . '/../vendor/nextcloud/ocp/';
            $path = $base . $relative;
            if (is_file($path)) {
                require_once $path;
            }
        }
    });
}

// Provide minimal stubs for internal classes referenced by public interfaces when not running inside full server
if (!interface_exists('OC\\Hooks\\Emitter')) {
    eval('namespace OC\\Hooks; interface Emitter {}');
}
if (!class_exists('OC\\User\\NoUserException')) {
    eval('namespace OC\\User; class NoUserException extends \Exception {}');
}
