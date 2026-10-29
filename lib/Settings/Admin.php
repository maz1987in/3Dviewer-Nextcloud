<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Settings;

use OCA\ThreeDViewer\Service\EmbedOrigins;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Services\IInitialState;
use OCP\Settings\ISettings;

/**
 * The admin's settings for the app: the sites allowed to embed public links.
 */
class Admin implements ISettings
{
    public function __construct(
        private readonly IInitialState $initialState,
        private readonly EmbedOrigins $origins,
    ) {
    }

    public function getForm(): TemplateResponse
    {
        $this->initialState->provideInitialState('embed-admin', ['origins' => $this->origins->list()]);

        return new TemplateResponse('threedviewer', 'settings-admin');
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
