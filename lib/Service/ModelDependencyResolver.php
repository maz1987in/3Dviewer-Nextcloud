<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCA\ThreeDViewer\Constants\SupportedFormats;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\NotFoundException;

/**
 * Resolve a model's companion files by name, limited to what the model itself declares.
 *
 * Signed-in visitors find an OBJ's textures through the file-listing API and fetch them
 * by id. That API needs a session, so on a public share the only handle a client has is
 * the name written inside the material — which means the server has to accept a name and
 * hand back a file.
 *
 * That is exactly the dangerous shape, so the declaration is the authorisation: a name is
 * servable only if the shared model (or a material it names) points at it. Without that
 * rule a link to any OBJ would become a name-guessing oracle over the owner's folder,
 * because a single-file share exposes one file while its neighbours are not shared at all.
 *
 * @psalm-suppress PossiblyUnusedMethod Constructed by the DI container.
 */
class ModelDependencyResolver
{
    /** `mtllib chair.mtl` */
    private const MTLLIB_LINE = '/^[^\S\r\n]*mtllib[^\S\r\n]+(.+?)[^\S\r\n]*$/mi';

    /** COLLADA `<init_from>wood.png</init_from>`, and the 1.5 `<init_from><ref>…</ref></init_from>` */
    private const COLLADA_IMAGE = '#<init_from\b[^>]*>\s*(?:<ref\b[^>]*>\s*)?([^<]+?)\s*(?:</ref>\s*)?</init_from>#i';

    /** X3D `url='"wood.png"'` or `url="wood.png"`, capturing the whole MFString list */
    private const X3D_URL = '#\burl\s*=\s*(["\'])(.*?)\1#is';

    /** `map_Kd wood.png`, `bump normal.png`, `refl env.png`, `disp height.png` */
    private const MAP_LINE = '/^[^\S\r\n]*(?:map_[A-Za-z0-9_]+|bump|refl|disp|decal)[^\S\r\n]+(.+?)[^\S\r\n]*$/mi';

    /**
     * `mtllib` must precede the first `usemtl`, so it sits in the header of every OBJ a
     * real exporter produces. Scanning only the head keeps a 500 MB mesh from being
     * pulled through memory on each texture request.
     */
    private const MODEL_SCAN_BYTES = 4 * 1024 * 1024;

    /** Material libraries are tiny; a glTF document only gets big when it embeds its data. */
    private const DEPENDENCY_SCAN_BYTES = 16 * 1024 * 1024;

    /**
     * How many distinct material libraries one model may pull in.
     *
     * Every `mtllib` name costs a storage lookup, and roughly 226,000 of them fit inside
     * MODEL_SCAN_BYTES. Unbounded, one crafted OBJ turns each `/dep/{name}` request on
     * its public share into hundreds of thousands of lookups — and since anyone with an
     * account can upload and share the model themselves, no victim has to cooperate.
     * Real exporters emit one `mtllib`; a handful is already unusual.
     */
    public const MAX_MATERIALS = 16;

    /**
     * Find the file a public client asked for by name.
     *
     * @param File   $model         the shared model, already authorised against the share
     * @param string $requestedName plain filename, as parsed from the model by the client
     *
     * @throws NotFoundException when the model does not declare that name, or the name
     *                           does not resolve to a file that may be served
     */
    public function resolve(File $model, string $requestedName): File
    {
        // A path here would let the caller pick the directory rather than the model —
        // the route pattern already excludes slashes, this is the guarantee behind it.
        if ($requestedName === '' || strpbrk($requestedName, '/\\') !== false) {
            throw new NotFoundException('Dependency name must be a plain filename');
        }

        $declared = $this->declaredDependencies($model);
        $relativePath = $declared[mb_strtolower($requestedName)] ?? null;
        if ($relativePath === null) {
            throw new NotFoundException('Not declared by the shared model');
        }

        $parent = $model->getParent();
        /* @psalm-suppress DocblockTypeContradiction Node::getParent() is nullable at runtime */
        if (!$parent instanceof Folder) {
            throw new NotFoundException('Parent folder missing');
        }

        $node = $parent->get($relativePath);
        if (!$node instanceof File || !$this->isServableDependency($node)) {
            // Deliberately the same failure as "never declared": whether the name exists
            // on disk is not something an anonymous caller should be able to measure.
            throw new NotFoundException('Not a servable dependency');
        }

        return $node;
    }

    /**
     * Every companion file the model points at, keyed by lowercase basename and valued
     * by the path relative to the model's own folder.
     *
     * The client only ever knows basenames — it strips directories when parsing — so the
     * map is what remembers that `wood.png` was declared as `textures/wood.png`.
     *
     * @return array<string, string>
     */
    private function declaredDependencies(File $model): array
    {
        $parent = $model->getParent();
        /* @psalm-suppress DocblockTypeContradiction Node::getParent() is nullable at runtime */
        if (!$parent instanceof Folder) {
            return [];
        }

        return match (strtolower($model->getExtension())) {
            'obj' => $this->objDependencies($model, $parent),
            'gltf' => $this->gltfDependencies($model),
            'dae', 'x3d' => $this->xmlDependencies($model),
            'fbx', '3ds' => $this->binaryDependencies($model),
            // STL, PLY, GLB and the rest carry their data inline, so they declare nothing
            // and nothing beside them is reachable through this route.
            default => [],
        };
    }

    /** @return array<string, string> */
    private function objDependencies(File $model, Folder $parent): array
    {
        $map = [];
        $materialPaths = [];

        foreach ($this->capture($model, self::MTLLIB_LINE, self::MODEL_SCAN_BYTES) as $value) {
            foreach ($this->candidatePaths($value) as $candidate) {
                $path = $this->register($map, $candidate);
                if ($path !== null && str_ends_with(mb_strtolower($path), '.mtl')) {
                    $materialPaths[] = $path;
                }
            }
        }

        // Textures are named by the material, not by the OBJ, and relative to wherever
        // that material lives. Capped: see MAX_MATERIALS.
        foreach (array_slice(array_unique($materialPaths), 0, self::MAX_MATERIALS) as $materialPath) {
            $material = $this->readableSibling($parent, $materialPath, 'mtl');
            if ($material === null) {
                continue;
            }
            $directory = dirname($materialPath);
            foreach ($this->capture($material, self::MAP_LINE, self::DEPENDENCY_SCAN_BYTES) as $value) {
                foreach ($this->candidatePaths($value) as $candidate) {
                    $this->register($map, $directory === '.' ? $candidate : $directory . '/' . $candidate);
                }
            }
        }

        return $map;
    }

    /**
     * COLLADA and X3D name their textures in the document, the same way glTF does.
     *
     * Matched with patterns rather than parsed with an XML reader on purpose: these
     * documents arrive from whoever uploaded them, and a real parser brings entity
     * expansion with it — external entities and billion-laughs. Nothing here needs the
     * tree, only the texture paths, so the parser is not worth its attack surface.
     *
     * @return array<string, string>
     */
    private function xmlDependencies(File $model): array
    {
        $document = $this->head($model, self::DEPENDENCY_SCAN_BYTES);
        /** @var array<string, string> $map */
        $map = [];

        // COLLADA 1.4 writes <init_from>path</init_from>; 1.5 wraps it in <ref>.
        /** @var array<int, array<int, string>> $matches */
        $matches = [];
        if (preg_match_all(self::COLLADA_IMAGE, $document, $matches) > 0) {
            foreach ($matches[1] as $value) {
                $this->register($map, rawurldecode(trim($value)));
            }
        }

        // X3D's url is an MFString: whitespace-separated, quoted alternatives tried in
        // order, so any one of them may be the file sitting beside the model.
        /** @var array<int, array<int, string>> $urls */
        $urls = [];
        if (preg_match_all(self::X3D_URL, $document, $urls) > 0) {
            foreach ($urls[2] as $list) {
                $entries = preg_split('/\s+/', trim($list));
                foreach ($entries === false ? [] : $entries as $value) {
                    $value = trim($value, "\"'");
                    if ($value !== '') {
                        $this->register($map, rawurldecode($value));
                    }
                }
            }
        }

        return $map;
    }

    /**
     * FBX and 3DS name their textures in binary structures, so they are walked rather
     * than pattern-matched. See BinaryModelScanner for why the walk is structural.
     *
     * @return array<string, string>
     */
    private function binaryDependencies(File $model): array
    {
        try {
            $handle = $model->fopen('r');
        } catch (\Throwable) {
            return [];
        }
        if (!is_resource($handle)) {
            return [];
        }

        try {
            $paths = strtolower($model->getExtension()) === 'fbx'
                ? BinaryModelScanner::fbxTexturePaths($handle)
                : BinaryModelScanner::threeDsTexturePaths($handle);
        } finally {
            fclose($handle);
        }

        /** @var array<string, string> $map */
        $map = [];
        foreach ($paths as $path) {
            // normalise() applies the same rules the other formats get: Windows
            // separators folded, absolute paths and schemes refused, `..` collapsed.
            $this->register($map, $path);
        }

        return $map;
    }

    /** @return array<string, string> */
    private function gltfDependencies(File $model): array
    {
        $document = json_decode($this->head($model, self::DEPENDENCY_SCAN_BYTES), true);
        if (!is_array($document)) {
            return [];
        }

        /** @var array<string, string> $map */
        $map = [];
        foreach (['buffers', 'images'] as $section) {
            /** @var mixed $entries */
            $entries = $document[$section] ?? [];
            if (!is_array($entries)) {
                continue;
            }
            /** @var mixed $entry */
            foreach ($entries as $entry) {
                if (!is_array($entry) || !isset($entry['uri']) || !is_string($entry['uri'])) {
                    continue;
                }
                // glTF percent-encodes its URIs. `data:` payloads and remote URLs carry a
                // scheme and are dropped by normalise().
                $this->register($map, rawurldecode($entry['uri']));
            }
        }

        return $map;
    }

    /**
     * The filenames one declaration line can point at.
     *
     * MTL map statements may carry options ahead of the path — `map_Kd -s 1 1 1 wood.png`
     * — and options always begin with a dash, so a leading dash means the filename is the
     * final token. Otherwise the whole value is the name, because filenames legitimately
     * contain spaces. `mtllib a.mtl b.mtl` is also legal, so tokens that look like a
     * dependency in their own right are registered as well; a spaced filename survives
     * that because the whole value is registered first and the first entry wins.
     *
     * @return list<string>
     */
    private function candidatePaths(string $value): array
    {
        $value = trim($value);
        $tokens = preg_split('/\s+/', $value) ?: [];

        $paths = [str_starts_with($value, '-') ? (string) end($tokens) : $value];
        foreach ($tokens as $token) {
            if ($token !== '' && $this->hasDependencyExtension($token)) {
                $paths[] = $token;
            }
        }

        return $paths;
    }

    /**
     * @param array<string, string> $map
     *
     * @return string|null the normalised path that was registered, or null if rejected
     */
    private function register(array &$map, string $rawPath): ?string
    {
        $path = $this->normalise($rawPath);
        if ($path === null) {
            return null;
        }

        $key = mb_strtolower(basename($path));
        // First declaration wins, so a later line cannot redirect an already-known name.
        $map[$key] ??= $path;

        return $map[$key];
    }

    /**
     * Reduce a declared reference to a path inside the model's own folder, or reject it.
     */
    private function normalise(string $rawPath): ?string
    {
        // Exporters on Windows write backslashes; Nextcloud paths use forward slashes.
        $path = str_replace('\\', '/', trim($rawPath));

        if ($path === '' || str_starts_with($path, '/')) {
            return null;
        }
        // `data:`, `http:`, `file:` — anything with a scheme is not a file beside the model.
        if (preg_match('#^[a-z][a-z0-9+.\-]*:#i', $path) === 1) {
            return null;
        }

        $segments = [];
        foreach (explode('/', $path) as $segment) {
            if ($segment === '' || $segment === '.') {
                continue;
            }
            if ($segment === '..') {
                if ($segments === []) {
                    // Climbing out of the model's folder would reach files the share
                    // never covered.
                    return null;
                }
                array_pop($segments);
                continue;
            }
            $segments[] = $segment;
        }

        return $segments === [] ? null : implode('/', $segments);
    }

    private function readableSibling(Folder $parent, string $path, string $extension): ?File
    {
        try {
            $node = $parent->get($path);
        } catch (NotFoundException) {
            return null;
        }

        if (!$node instanceof File || strtolower($node->getExtension()) !== $extension) {
            return null;
        }

        return $node;
    }

    /**
     * Capture group 1 of every match in the head of a file.
     *
     * @param non-empty-string $pattern
     *
     * @return list<string>
     */
    private function capture(File $file, string $pattern, int $maxBytes): array
    {
        if (preg_match_all($pattern, $this->head($file, $maxBytes), $matches) === false) {
            return [];
        }

        /* @var list<string> */
        return $matches[1];
    }

    private function head(File $file, int $maxBytes): string
    {
        try {
            $handle = $file->fopen('r');
        } catch (\Throwable) {
            return '';
        }
        if (!is_resource($handle)) {
            return '';
        }

        try {
            $head = stream_get_contents($handle, $maxBytes);
        } finally {
            fclose($handle);
        }

        return $head === false ? '' : $head;
    }

    private function isServableDependency(File $file): bool
    {
        return $this->hasDependencyExtension($file->getName());
    }

    /**
     * Companion formats only — materials, glTF buffers and textures.
     *
     * Model formats are excluded on purpose: a model beside the shared one is reachable
     * through the share's own file route when the share covers it, and being named by a
     * declaration is not the same as being shared.
     */
    private function hasDependencyExtension(string $name): bool
    {
        return SupportedFormats::isDependencyFormat(pathinfo($name, PATHINFO_EXTENSION));
    }
}
