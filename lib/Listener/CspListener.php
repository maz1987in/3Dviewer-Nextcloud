<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Listener;

use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use Psr\Log\LoggerInterface;

/**
 * Listener to modify CSP headers for 3D viewer compatibility
 */
class CspListener implements IEventListener {
	private LoggerInterface $logger;

	public function __construct(LoggerInterface $logger) {
		$this->logger = $logger;
	}

	public function handle(Event $event): void {
		if (!($event instanceof BeforeTemplateRenderedEvent)) {
			return;
		}

		$response = $event->getResponse();
		
		// Apply CSP modifications for all requests to allow blob URLs for 3D viewer
		$this->logger->info('[ThreeDViewer] Applying CSP modifications for 3D viewer compatibility');
		
		$csp = new ContentSecurityPolicy();
		
		// Allow blob URLs for GLTF texture loading and WebGL contexts
		$csp->addAllowedConnectDomain('blob:');
		$csp->addAllowedImageDomain('blob:');
		$csp->addAllowedImageDomain('data:');
		
		// Allow workers with blob URLs
		$csp->addAllowedChildSrcDomain('blob:');
		
		$response->setContentSecurityPolicy($csp);
		
		$this->logger->info('[ThreeDViewer] CSP headers applied successfully');
	}
}
