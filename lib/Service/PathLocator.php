<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCP\Files\Folder;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use OCP\Files\NotPermittedException;

/**
 * Find the node a relative path points at, matching case only where it has to.
 *
 * Nextcloud storage is case-sensitive; the tools that write 3D models frequently are not.
 * 3DS keeps its map names in DOS 8.3 form, so an exporter writes WOOD.JPG for a file saved
 * as wood.jpg, and MTL files authored on Windows name `Textures/wood.png` for a folder
 * saved as `textures`. Asking storage for the path exactly as written then misses, and the
 * model renders untextured with its texture sitting right beside it.
 *
 * Both halves of the app hit this: the public route resolves a declared path through
 * ModelDependencyResolver, and a signed-in client turns a declared path into a file id
 * through FileController. One implementation, so the two cannot drift apart.
 *
 * @psalm-suppress PossiblyUnusedMethod Constructed by the DI container.
 */
class PathLocator
{
    /**
     * @param Folder $parent the folder the path is relative to
     * @param string $path   a relative path, `/`-separated
     *
     * @return Node|null the node, or null when no segment matches
     */
    public function locate(Folder $parent, string $path): ?Node
    {
        try {
            return $parent->get($path);
        } catch (NotFoundException|NotPermittedException) {
            // A miss, or a path storage refuses outright. Either way, try the walk —
            // which is the only thing that can recover a difference in case.
        }

        $current = $parent;
        foreach (explode('/', $path) as $segment) {
            // The walk matches names *inside* a folder, so it can only descend. Refusing
            // these outright says so in the code, rather than resting on the fact that no
            // stored file is allowed to be called `..`.
            if ($segment === '' || $segment === '.' || $segment === '..') {
                return null;
            }

            if (!$current instanceof Folder) {
                return null;
            }

            $next = $this->childNamed($current, $segment);
            if ($next === null) {
                return null;
            }

            $current = $next;
        }

        return $current === $parent ? null : $current;
    }

    /**
     * One directory level, matched without regard to case.
     *
     * Where several names differ only in case, an exact match wins and otherwise the
     * lexicographically first does — listing order is not guaranteed, and which file the
     * app serves should not depend on it.
     */
    private function childNamed(Folder $folder, string $segment): ?Node
    {
        $wanted = mb_strtolower($segment);

        /** @var list<Node> $matches */
        $matches = [];
        foreach ($folder->getDirectoryListing() as $child) {
            $name = $child->getName();
            if ($name === $segment) {
                return $child;
            }
            if (mb_strtolower($name) === $wanted) {
                $matches[] = $child;
            }
        }

        if ($matches === []) {
            return null;
        }

        usort($matches, static fn (Node $a, Node $b): int => strcmp($a->getName(), $b->getName()));

        return $matches[0];
    }
}
