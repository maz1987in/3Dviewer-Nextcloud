<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\AppInfo;

use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\IURLGenerator;
use OCP\Util;
use OCA\ThreeDViewer\Controller\AssetController;

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

		// Register Files app integration
		if (\class_exists('OCA\\ThreeDViewer\\FileAction\\View3DAction') && \method_exists($context, 'registerEventListener')) {
			/** @psalm-suppress UndefinedInterfaceMethod */
			$context->registerEventListener('OCA\\Files\\Event\\LoadSidebar', 'OCA\\ThreeDViewer\\FileAction\\View3DAction');
			/** @psalm-suppress UndefinedInterfaceMethod */
			$context->registerEventListener('OCA\\Files\\Event\\LoadViewer', 'OCA\\ThreeDViewer\\FileAction\\View3DAction');
		}

		// Register asset controller for serving decoder files
		if (\method_exists($context, 'registerService')) {
			/** @psalm-suppress UndefinedInterfaceMethod */
			$context->registerService(AssetController::class, function($c) {
				return new AssetController(
					$c->query('OCP\\IRequest'),
					$c->query('OCP\\IURLGenerator')
				);
			});
		}
		
		// Register controller for routes
		if (\method_exists($context, 'registerController')) {
			/** @psalm-suppress UndefinedInterfaceMethod */
			$context->registerController(AssetController::class);
		}
	}

	public function boot(IBootContext $context): void {
		// Load Files integration assets only when needed
		// The View3DAction will handle loading the script in Files app context

		// Extend CSP for WebAssembly support
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
			/** @psalm-suppress MixedMethodCall */ $policy->addAllowedScriptDomain('unsafe-eval');
			/** @psalm-suppress MixedMethodCall */ $policy->addAllowedScriptDomain('unsafe-inline');
			/** @psalm-suppress UndefinedInterfaceMethod */ $context->registerCSP($policy);
		}
	}
}
