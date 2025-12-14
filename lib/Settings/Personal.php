<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Settings;

use OCP\AppFramework\Http\TemplateResponse;
use OCP\Settings\ISettings;

class Personal implements ISettings
{
    public function getForm(): TemplateResponse
    {
        return new TemplateResponse('threedviewer', 'settings-personal');
    }

    public function getSection(): string
    {
        return 'threedviewer';
    }

    public function getPriority(): int
    {
        return 50;
    }
}
