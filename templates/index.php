<?php

declare(strict_types=1);

use OCP\Util;

Util::addScript(OCA\ThreeDViewer\AppInfo\Application::APP_ID, OCA\ThreeDViewer\AppInfo\Application::APP_ID . '-main');
Util::addStyle(OCA\ThreeDViewer\AppInfo\Application::APP_ID, OCA\ThreeDViewer\AppInfo\Application::APP_ID . '-main');

?>

<div id="threedviewer" 
	 data-file-id="<?php p($_['fileId'] ?? ''); ?>" 
	 data-filename="<?php p($_['filename'] ?? ''); ?>"
	 data-dir="<?php p($_['dir'] ?? $_GET['dir'] ?? ''); ?>"></div>
