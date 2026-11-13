<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Search;

use OCA\ThreeDViewer\Constants\SupportedFormats;
use OCA\ThreeDViewer\Service\ThumbnailService;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IMimeTypeDetector;
use OCP\Files\IRootFolder;
use OCP\Files\Node;
use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\IUser;
use OCP\Search\IProvider;
use OCP\Search\ISearchQuery;
use OCP\Search\SearchResult;
use OCP\Search\SearchResultEntry;
use Psr\Log\LoggerInterface;

/**
 * Finds 3D models by name among the files a user can open, for the Smart Picker's "3D
 * models" entry (ModelReferenceProvider names this provider).
 *
 * It is not listed in the search bar (getOrder): Files' own results already find a model
 * by name there, and a second search of the whole file tree on every keystroke would
 * double the cost for every user to show the same files again.
 *
 * The result's link is the viewer link, which is what a pick inserts. The search runs on
 * the user's own file tree (their files and what is shared with them), so every hit is a
 * file they may open. The app's file index is not used: it only holds the files indexed
 * since the app was installed or last re-indexed, and a picker that cannot find a model
 * that is there is worse than a slower one.
 *
 * @psalm-suppress MissingDependency Nextcloud runtime provides dependent classes in full environment.
 */
class ModelSearchProvider implements IProvider
{
    public const ID = 'threedviewer-models';

    /** A shorter term matches nearly every file. */
    private const MIN_TERM_LENGTH = 2;

    /** @psalm-suppress PossiblyUnusedMethod Constructed by the DI container */
    public function __construct(
        private readonly IRootFolder $rootFolder,
        private readonly IURLGenerator $urlGenerator,
        private readonly IMimeTypeDetector $mimeTypes,
        private readonly ThumbnailService $thumbnails,
        private readonly IL10N $l10n,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function getId(): string
    {
        return self::ID;
    }

    public function getName(): string
    {
        return $this->l10n->t('3D models');
    }

    /**
     * Null keeps it out of the search bar; the Smart Picker asks it by id all the same.
     */
    public function getOrder(string $route, array $routeParameters): ?int
    {
        return null;
    }

    public function search(IUser $user, ISearchQuery $query): SearchResult
    {
        $term = trim($query->getTerm());
        $name = $this->getName();
        if (mb_strlen($term) < self::MIN_TERM_LENGTH) {
            return SearchResult::complete($name, []);
        }

        $offset = max(0, (int) $query->getCursor());
        $limit = max(1, $query->getLimit());

        try {
            $home = $this->rootFolder->getUserFolder($user->getUID());
            $models = $this->models($home->search($term));
            $entries = array_map(
                fn (File $file): SearchResultEntry => $this->entryFor($file, $home),
                array_slice($models, $offset, $limit),
            );
        } catch (\Throwable $e) {
            // A search that fails has no hits; it must not break the picker or the search bar.
            $this->logger->warning('3D model search failed', ['exception' => $e]);

            return SearchResult::complete($name, []);
        }

        return count($models) > $offset + $limit
            ? SearchResult::paginated($name, $entries, $offset + $limit)
            : SearchResult::complete($name, $entries);
    }

    /**
     * The readable model files among some search hits, the most recently changed first.
     *
     * @param array<array-key, Node> $nodes
     * @return list<File>
     */
    private function models(array $nodes): array
    {
        $models = array_values(array_filter(
            $nodes,
            static fn (Node $node): bool => $node instanceof File
                && $node->isReadable()
                && in_array(strtolower($node->getExtension()), SupportedFormats::getModelExtensions(), true),
        ));
        usort($models, static fn (File $a, File $b): int => $b->getMTime() <=> $a->getMTime());

        return $models;
    }

    private function entryFor(File $file, Folder $home): SearchResultEntry
    {
        $directory = dirname($home->getRelativePath($file->getPath()) ?? '/' . $file->getName());

        return new SearchResultEntry(
            $this->imageFor($file),
            $file->getName(),
            strtoupper($file->getExtension()) . ' · ' . $directory,
            $this->urlGenerator->linkToRouteAbsolute('threedviewer.page.viewer', ['fileId' => $file->getId()]),
        );
    }

    /** The model's thumbnail if the viewer stored one for this version, else its file-type icon. */
    private function imageFor(File $file): string
    {
        try {
            $etag = $file->getEtag();
            if ($etag !== '' && $this->thumbnails->has($file->getId(), $etag)) {
                return $this->urlGenerator->linkToRouteAbsolute('core.Preview.getPreviewByFileId', [
                    'fileId' => $file->getId(),
                    'x' => 64,
                    'y' => 64,
                ]);
            }
        } catch (\Throwable $e) {
            $this->logger->warning('Could not check for a stored thumbnail', ['fileId' => $file->getId(), 'exception' => $e]);
        }

        return $this->mimeTypes->mimeTypeIcon($file->getMimeType());
    }
}
