<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Reference;

use OCA\ThreeDViewer\AppInfo\Application;
use OCA\ThreeDViewer\Constants\SupportedFormats;
use OCA\ThreeDViewer\Search\ModelSearchProvider;
use OCA\ThreeDViewer\Service\FileSettingsService;
use OCA\ThreeDViewer\Service\ThumbnailService;
use OCP\Collaboration\Reference\ADiscoverableReferenceProvider;
use OCP\Collaboration\Reference\IReference;
use OCP\Collaboration\Reference\ISearchableReferenceProvider;
use OCP\Collaboration\Reference\Reference;
use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\IUserSession;
use OCP\Util;
use Psr\Log\LoggerInterface;

/**
 * Shows a link to a 3D model as a card in Talk, Text, Collectives, Deck, Mail and the other
 * apps that render link previews, and puts "3D models" in the Smart Picker.
 *
 * What it claims: the app's own viewer links, `/apps/threedviewer/f/{fileId}` with or
 * without `index.php`, with anything after the id (a saved view, `?dir=`) left to the link
 * itself. It does not claim Files links (`/f/{fileId}`, `/apps/files/?fileid=`): Nextcloud
 * hands a link to the first provider that matches it and never falls through, so a provider
 * that matched every `/f/` link would have to answer for files that are not models, and
 * core's own Files card already shows a 3D file's name and thumbnail.
 *
 * What it shows is decided per reader. A link to a file the reader cannot open, a file
 * that is not a model, or a reader who is not signed in resolves to nothing at all: no
 * title, no thumbnail, and no difference between "no such file" and "not yours".
 *
 * @psalm-suppress MissingDependency Nextcloud runtime provides dependent classes in full environment.
 */
class ModelReferenceProvider extends ADiscoverableReferenceProvider implements ISearchableReferenceProvider
{
    public const ID = 'threedviewer';
    public const RICH_OBJECT_TYPE = 'threedviewer_model';

    /** Query parameters a view link carries: `view` (src/utils/viewLink.js) and the older `cam`. */
    private const VIEW_PARAMETERS = ['view', 'cam'];

    /** @psalm-suppress PossiblyUnusedMethod Constructed by the DI container */
    public function __construct(
        private readonly IURLGenerator $urlGenerator,
        private readonly IRootFolder $rootFolder,
        private readonly IUserSession $userSession,
        private readonly ThumbnailService $thumbnails,
        private readonly FileSettingsService $fileSettings,
        private readonly IL10N $l10n,
        private readonly LoggerInterface $logger,
    ) {
    }

    /**
     * The cache prefix a file's links share. It is the file id on its own, as core's Files
     * provider uses, so what core clears when a file is deleted, renamed or shared (and what
     * this app clears when the file is written or gets a thumbnail) clears these cards too.
     */
    public static function cachePrefixFor(int $fileId): string
    {
        return (string) $fileId;
    }

    public function matchReference(string $referenceText): bool
    {
        return $this->fileIdOf($referenceText) !== null;
    }

    public function resolveReference(string $referenceText): ?IReference
    {
        $fileId = $this->fileIdOf($referenceText);
        $uid = $this->userSession->getUser()?->getUID();
        if ($fileId === null || $uid === null) {
            return null;
        }

        try {
            $file = $this->openableModel($fileId, $uid);
            if ($file === null) {
                return null;
            }

            return $this->describe($referenceText, $file);
        } catch (\Throwable $e) {
            // A card that cannot be made leaves the bare link; it must not break the page.
            $this->logger->warning('Could not resolve a 3D model link', ['fileId' => $fileId, 'exception' => $e]);

            return null;
        }
    }

    public function getCachePrefix(string $referenceId): string
    {
        $fileId = $this->fileIdOf($referenceId);

        return $fileId === null ? '' : self::cachePrefixFor($fileId);
    }

    /**
     * One entry per reader and per link. Per reader, because what a card shows depends on
     * what the reader may open and its description is in the reader's language. Per link,
     * because two links to one file differ (one opens a saved view, the other does not), and
     * because the prefix is shared with core's Files provider, whose key is the reader alone:
     * a key of just the user id would hand a Files card to a viewer link and the other way round.
     */
    public function getCacheKey(string $referenceId): ?string
    {
        return ($this->userSession->getUser()?->getUID() ?? '') . "\n" . $referenceId;
    }

    public function getId(): string
    {
        return self::ID;
    }

    public function getTitle(): string
    {
        return $this->l10n->t('3D models');
    }

    public function getOrder(): int
    {
        return 20;
    }

    public function getIconUrl(): string
    {
        return $this->urlGenerator->imagePath(Application::APP_ID, 'app-dark.svg');
    }

    /**
     * The Smart Picker lets people find a model by name through this search provider; the
     * link it inserts is the viewer link.
     */
    public function getSupportedSearchProviderIds(): array
    {
        return [ModelSearchProvider::ID];
    }

    /**
     * The id in one of the app's viewer links, or null for any other text.
     *
     * Only the path decides: the id must follow the viewer's `/f/` route directly and be a
     * plain positive number, and what follows it must start a query or a fragment. A longer
     * path (`/f/12/extra`), a trailing slash and an id with a sign or leading zeros are not
     * the route, so they are not claimed.
     */
    private function fileIdOf(string $text): ?int
    {
        foreach ($this->viewerPrefixes() as $prefix) {
            if (!str_starts_with($text, $prefix)) {
                continue;
            }
            // Up to 18 digits always fits in a 64-bit int.
            if (preg_match('/^([1-9][0-9]{0,17})(?:[?#]\S*)?$/D', substr($text, strlen($prefix)), $match) === 1) {
                return (int) $match[1];
            }
        }

        return null;
    }

    /**
     * The start of the viewer's file route in each form a link takes: with `index.php`, and
     * without it, on a server in a subfolder too (getAbsoluteURL adds the web root).
     *
     * @return list<string>
     */
    private function viewerPrefixes(): array
    {
        $route = '/apps/' . Application::APP_ID . '/f/';

        return [
            $this->urlGenerator->getAbsoluteURL('/index.php' . $route),
            $this->urlGenerator->getAbsoluteURL($route),
        ];
    }

    /**
     * The model behind an id, if it is in the reader's files (their own or shared with
     * them), a model format, and one they may read.
     */
    private function openableModel(int $fileId, string $uid): ?File
    {
        $node = $this->rootFolder->getUserFolder($uid)->getFirstNodeById($fileId);
        if (!$node instanceof File || !$node->isReadable()) {
            return null;
        }
        if (!in_array(strtolower($node->getExtension()), SupportedFormats::getModelExtensions(), true)) {
            return null;
        }

        return $node;
    }

    private function describe(string $link, File $file): IReference
    {
        $fileId = $file->getId();
        $format = strtoupper($file->getExtension());
        $size = (int) $file->getSize();
        $unit = $this->unitOf($fileId);
        $thumbnail = $this->thumbnailUrl($file);

        $parts = [$format, $this->humanSize($size)];
        if ($unit !== null) {
            $parts[] = $this->l10n->t('Units: %s', [$unit]);
        }
        $description = implode(' · ', $parts);

        $reference = new Reference($link);
        $reference->setTitle($file->getName());
        $reference->setDescription($description);
        $reference->setUrl($link);
        $reference->setImageUrl($thumbnail);
        $reference->setRichObject(self::RICH_OBJECT_TYPE, [
            'id' => $fileId,
            'name' => $file->getName(),
            'format' => $format,
            'size' => $size,
            'unit' => $unit,
            'description' => $description,
            'thumbnail' => $thumbnail,
            'link' => $link,
            'hasView' => $this->carriesView($link),
            // Worded here, in the reader's language, so the card needs no translation library
            'labels' => [
                'open' => $this->l10n->t('Open in 3D Viewer'),
                'view' => $this->l10n->t('Opens at a shared view'),
            ],
        ]);

        return $reference;
    }

    /** The unit someone set for a file that records none, if anyone did; a lookup that fails is no unit. */
    private function unitOf(int $fileId): ?string
    {
        try {
            return $this->fileSettings->settings($fileId)['unit'];
        } catch (\Throwable $e) {
            $this->logger->warning('Could not read the unit of a model for its card', ['fileId' => $fileId, 'exception' => $e]);

            return null;
        }
    }

    /**
     * Nextcloud's preview of the file, but only once the viewer has stored a thumbnail for
     * this version of it: without one, the preview would be a file-type icon, and the card
     * has its own placeholder for that.
     */
    private function thumbnailUrl(File $file): ?string
    {
        $etag = $file->getEtag();
        if ($etag === '' || !$this->thumbnails->has($file->getId(), $etag)) {
            return null;
        }

        return $this->urlGenerator->linkToRouteAbsolute('core.Preview.getPreviewByFileId', [
            'fileId' => $file->getId(),
            'x' => 640,
            'y' => 360,
            'a' => 1,
        ]);
    }

    /** Whether the link is a "Copy link to this view" link: it carries a camera, shading and so on. */
    private function carriesView(string $link): bool
    {
        $query = (string) parse_url($link, PHP_URL_QUERY);
        parse_str($query, $parameters);

        return array_intersect(self::VIEW_PARAMETERS, array_keys($parameters)) !== [];
    }

    /**
     * Seam for testing: Util::humanFileSize is static and needs a live server.
     */
    protected function humanSize(int $bytes): string
    {
        return Util::humanFileSize($bytes);
    }
}
