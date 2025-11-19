<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCA\ThreeDViewer\AppInfo\Application;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IConfig;
use OCP\IRequest;

class ConfigController extends Controller
{
	public function __construct(
		string $appName,
		IRequest $request,
		private IConfig $config,
		private ?string $userId
	) {
		parent::__construct($appName, $request);
	}

	/**
	 * Set user configuration values
	 */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	#[FrontpageRoute(verb: 'PUT', url: '/config')]
	public function setConfig(array $values): DataResponse
	{
		if ($this->userId === null) {
			return new DataResponse(['error' => 'User not authenticated'], 401);
		}

		foreach ($values as $key => $value) {
			$this->config->setUserValue($this->userId, Application::APP_ID, $key, (string)$value);
		}

		return new DataResponse([]);
	}
}

