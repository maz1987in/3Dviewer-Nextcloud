<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCA\ThreeDViewer\AppInfo\Application;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IConfig;
use OCP\IRequest;
use OCP\IUserSession;

class SettingsController extends Controller {
	public function __construct(
		string $appName,
		IRequest $request,
		private IConfig $config,
		private IUserSession $userSession,
	) {
		parent::__construct($appName, $request);
	}

	/**
	 * @return DataResponse<string, mixed>
	 */
	#[NoAdminRequired]
	public function getSettings(): DataResponse {
		$userId = $this->userSession->getUser()->getUID();
		// Retrieve all saved user settings
		// We'll prefix them to avoid collisions if necessary, or just use app keys
		// For now, let's assume we store them as a JSON string for complex objects or individual keys
		// But simpler to just return what we have saved.
		
		// List of keys we support saving (matching viewer-config.js structure flattened or top-level)
		// For simplicity, let's allow saving the whole config as a JSON blob 'user_preferences'
		$userPreferences = $this->config->getUserValue($userId, $this->appName, 'user_preferences', '{}');
		
		return new DataResponse([
			'settings' => json_decode($userPreferences, true) ?: [],
		]);
	}

	/**
	 * @return DataResponse<string, mixed>
	 */
	#[NoAdminRequired]
	public function saveSettings(): DataResponse {
		$userId = $this->userSession->getUser()->getUID();
		$settings = $this->request->getParam('settings');
		
		// If settings param is missing or null, default to empty array
		if ($settings === null) {
			$settings = [];
		}
		
		// Ensure settings is an array
		if (!is_array($settings)) {
			$settings = [];
		}
		
		// Save the entire settings object as a JSON string
		// This allows us to support the full nested structure of viewer-config.js
		$this->config->setUserValue($userId, $this->appName, 'user_preferences', json_encode($settings));
		
		return new DataResponse([]);
	}

	/**
	 * Reset settings to default
	 * @return DataResponse<string, mixed>
	 */
	#[NoAdminRequired]
	public function resetSettings(): DataResponse {
		$userId = $this->userSession->getUser()->getUID();
		$this->config->deleteUserValue($userId, $this->appName, 'user_preferences');
		return new DataResponse([]);
	}
}

