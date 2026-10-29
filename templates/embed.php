<?php

declare(strict_types=1);

use OCP\Util;

// The page is empty until its script has asked whether the share may be shown
Util::addScript(OCA\ThreeDViewer\AppInfo\Application::APP_ID, OCA\ThreeDViewer\AppInfo\Application::APP_ID . '-embed');
Util::addStyle(OCA\ThreeDViewer\AppInfo\Application::APP_ID, OCA\ThreeDViewer\AppInfo\Application::APP_ID . '-embed');
