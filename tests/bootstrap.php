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

// OCP\DB\QueryBuilder\IQueryBuilder derives its PARAM_* constants from Doctrine
// DBAL, but nextcloud/ocp does not require doctrine/dbal — the real server
// provides it. Without these, merely creating a mock of IDBConnection or
// IQueryBuilder dies with "Class Doctrine\DBAL\ParameterType not found", which
// is why nothing in this suite could exercise a database-facing class.
//
// Values follow DBAL 3, which is what the OCP constants were written against.
// Each stub is guarded, so a real doctrine/dbal — or running inside a full
// Nextcloud tree — always takes precedence over what is defined here.
if (!class_exists('Doctrine\\DBAL\\ParameterType')) {
    eval('namespace Doctrine\DBAL; class ParameterType {
        public const NULL = 0;
        public const INTEGER = 1;
        public const STRING = 2;
        public const LARGE_OBJECT = 3;
        public const BOOLEAN = 5;
        public const BINARY = 16;
        public const ASCII = 17;
    }');
}
if (!class_exists('Doctrine\\DBAL\\ArrayParameterType')) {
    eval('namespace Doctrine\DBAL; class ArrayParameterType {
        public const INTEGER = 101;
        public const STRING = 102;
        public const ASCII = 117;
        public const BINARY = 116;
    }');
}
if (!class_exists('Doctrine\\DBAL\\Connection')) {
    eval('namespace Doctrine\DBAL; class Connection {}');
}
if (!class_exists('Doctrine\\DBAL\\Query\\Expression\\ExpressionBuilder')) {
    eval('namespace Doctrine\DBAL\Query\Expression; class ExpressionBuilder {
        public const EQ = "=";
        public const NEQ = "<>";
        public const LT = "<";
        public const LTE = "<=";
        public const GT = ">";
        public const GTE = ">=";
    }');
}
if (!class_exists('Doctrine\\DBAL\\Types\\Types')) {
    eval('namespace Doctrine\DBAL\Types; class Types {
        public const BOOLEAN = "boolean";
        public const DATE_MUTABLE = "date";
        public const DATE_IMMUTABLE = "date_immutable";
        public const DATETIME_MUTABLE = "datetime";
        public const DATETIME_IMMUTABLE = "datetime_immutable";
        public const DATETIMETZ_MUTABLE = "datetimetz";
        public const DATETIMETZ_IMMUTABLE = "datetimetz_immutable";
        public const TIME_MUTABLE = "time";
        public const TIME_IMMUTABLE = "time_immutable";
    }');
}
// Migration steps call Type::getType() to widen a column. The stub records the
// name so a test can assert which type was requested; the real class resolves
// it to a platform-specific mapping, which is the server's concern, not ours.
if (!class_exists('Doctrine\\DBAL\\Types\\Type')) {
    eval('namespace Doctrine\DBAL\Types; class Type {
        private string $name;
        private function __construct(string $name) { $this->name = $name; }
        public static function getType(string $name): self { return new self($name); }
        public function getName(): string { return $this->name; }
    }');
}

// files_sharing is a shipped app, not part of the nextcloud/ocp package, so its
// public-share event is absent outside a full server. Without this stub every test
// touching the public share page silently skips — which looks green but protects
// nothing.
if (!class_exists('OCA\\Files_Sharing\\Event\\BeforeTemplateRenderedEvent')) {
    require_once __DIR__ . '/stubs/Files_Sharing_BeforeTemplateRenderedEvent.php';
}
