<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\AppInfo;

use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\IURLGenerator;

use function file_exists;

class Application extends App implements IBootstrap {
	public const APP_ID = 'threedviewer';

	/** @psalm-suppress PossiblyUnusedMethod */
	public function __construct() {
		parent::__construct(self::APP_ID);
	}

	public function register(IRegistrationContext $context): void {
		// Register repair step for missing 3D MIME types (idempotent)
		if (\class_exists('OCA\\ThreeDViewer\\Repair\\RegisterThreeDMimeTypes') && \method_exists($context, 'registerRepairStep')) {
			/** @psalm-suppress UndefinedInterfaceMethod */
			$context->registerRepairStep('OCA\\ThreeDViewer\\Repair\\RegisterThreeDMimeTypes');
		}
		if (\class_exists('OCA\\ThreeDViewer\\Repair\\CleanupThreeDMimeTypes') && \method_exists($context, 'registerRepairStep')) {
			/** @psalm-suppress UndefinedInterfaceMethod */
			$context->registerRepairStep('OCA\\ThreeDViewer\\Repair\\CleanupThreeDMimeTypes');
		}
	}

	public function boot(IBootContext $context): void {
		// Extend CSP only if decoder asset directories exist to avoid unnecessarily broad policies.
		$root = dirname(__DIR__, 2); // go from lib/AppInfo to app root
		$hasDraco = is_dir($root . '/draco') && file_exists($root . '/draco/draco_decoder.wasm');
		$hasBasis = is_dir($root . '/basis') && file_exists($root . '/basis/basis_transcoder.wasm');
		if ($hasDraco || $hasBasis) {
			$cspClass = 'OCP\\Security\\CSP\\ContentSecurityPolicy';
			if (\class_exists($cspClass) && \method_exists($context, 'registerCSP')) {
				/** @psalm-suppress MixedAssignment */
				/** @psalm-suppress MixedMethodCall Dynamic instantiation of optional Nextcloud CSP class */
				$policy = new $cspClass();
				// Below calls guarded by runtime check; Psalm may see dynamic type.
				/** @psalm-suppress MixedMethodCall */ $policy->addAllowedScriptDomain('self');
				/** @psalm-suppress MixedMethodCall */ $policy->addAllowedScriptDomain('blob:');
				/** @psalm-suppress MixedMethodCall */ $policy->addAllowedConnectDomain('self');
				/** @psalm-suppress MixedMethodCall */ $policy->addAllowedConnectDomain('blob:');
				/** @psalm-suppress MixedMethodCall */ $policy->addAllowedWorkerSrcDomain('self');
				/** @psalm-suppress MixedMethodCall */ $policy->addAllowedWorkerSrcDomain('blob:');
				/** @psalm-suppress UndefinedInterfaceMethod */ $context->registerCSP($policy);
			}
		}
	}
}
