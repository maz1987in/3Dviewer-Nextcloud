<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCA\ThreeDViewer\AppInfo\Application;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IConfig;
use OCP\IRequest;

class ConfigController extends Controller
{
    /** The user config keys PageController reads back. */
    private const FILE_SORT = 'file_sort';
    private const SELECTED_FILE_ID = 'selected_file_id';
    private const SETTINGS = [self::FILE_SORT, self::SELECTED_FILE_ID];

    /** The sort modes the file navigation offers (`sortModes` in FileNavigation.vue). */
    private const SORT_MODES = ['viewer', 'folders', 'type', 'date', 'favorites'];

    public function __construct(
        string $appName,
        IRequest $request,
        private IConfig $config,
        private ?string $userId
    ) {
        parent::__construct($appName, $request);
    }

    /**
     * Set user configuration values.
     *
     * Only the settings the viewer stores are accepted, each with its own check, and the
     * whole request is refused if any key is unknown or any value is invalid, so a
     * request never stores part of what it asked for. Accepting any key would let a
     * caller write anything under the app's user config, including keys other code reads.
     *
     * @param array<array-key, mixed> $values setting name => value
     */
    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'PUT', url: '/config')]
    public function setConfig(array $values): DataResponse
    {
        if ($this->userId === null) {
            return new DataResponse(['error' => 'User not authenticated'], 401);
        }

        $clean = [];
        foreach ($values as $key => $value) {
            $key = (string) $key;
            if (!in_array($key, self::SETTINGS, true)) {
                return new DataResponse(['error' => 'Unknown setting'], 400);
            }

            $valid = $key === self::FILE_SORT ? $this->validSort($value) : $this->validFileId($value);
            if ($valid === null) {
                return new DataResponse(['error' => 'Invalid value for ' . $key], 400);
            }
            $clean[$key] = $valid;
        }

        foreach ($clean as $key => $value) {
            $this->config->setUserValue($this->userId, Application::APP_ID, $key, $value);
        }

        return new DataResponse([]);
    }

    /**
     * @return string|null the sort mode, or null when it is not one the viewer offers
     */
    private function validSort(mixed $value): ?string
    {
        return is_string($value) && in_array($value, self::SORT_MODES, true) ? $value : null;
    }

    /**
     * @return string|null the id as a plain decimal string, or null when it is not a
     *                     non-negative integer (the viewer sends it as a string)
     */
    private function validFileId(mixed $value): ?string
    {
        if (is_int($value)) {
            return $value >= 0 ? (string) $value : null;
        }

        // 18 digits stay inside a 64-bit integer, far beyond any real file id
        if (is_string($value) && preg_match('/^\d{1,18}$/D', $value) === 1) {
            return (string) (int) $value;
        }

        return null;
    }
}
