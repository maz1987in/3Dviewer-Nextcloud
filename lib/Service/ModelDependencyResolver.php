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
    /**
     * `mtllib chair.mtl`. The value runs greedily to the end of the line and is trimmed
     * by candidatePaths(): a lazy value followed by optional trailing blanks was
     * quadratic in a long run of blanks inside the line.
     */
    private const MTLLIB_LINE = '/^[^\S\r\n]*+mtllib[^\S\r\n]++(.+)$/mi';

    /** `map_Kd wood.png`, `bump normal.png`, `refl env.png`, `disp height.png`; greedy, as MTLLIB_LINE */
    private const MAP_LINE = '/^[^\S\r\n]*+(?:map_[A-Za-z0-9_]++|bump|refl|disp|decal)[^\S\r\n]++(.+)$/mi';

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
     * What a reference is trimmed of: the ASCII blanks, and nothing else. PHP's default
     * trim() also strips NUL, and JavaScript's strips no-break spaces, a byte-order mark
     * and the Unicode line separators; one set on both sides keeps the server reading the
     * name asciiTrim() in src/loaders/textureReferences.js reads.
     */
    private const BLANKS = " \t\n\r\v\f";

    /** @psalm-suppress PossiblyUnusedMethod Constructed via DI container */
    public function __construct(
        private readonly PathLocator $pathLocator,
    ) {
    }

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

        $node = $this->pathLocator->locate($parent, $relativePath);
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
                    $this->register($map, $candidate, $directory);
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

        // Forward scans with strpos rather than regular expressions: every one of these
        // documents is an upload, and a pattern that runs from each `<image` or
        // `<ImageTexture` to the end of an unclosed tag is quadratic in the document.
        foreach (self::colladaImageFiles($document) as $value) {
            $this->register($map, self::uriDecoded(trim(html_entity_decode($value, ENT_QUOTES | ENT_XML1, 'UTF-8'), self::BLANKS)));
        }
        foreach (self::x3dTextureUrls($document) as $value) {
            $this->register($map, self::uriDecoded($value));
        }

        return $map;
    }

    /**
     * The file each COLLADA `<image>` names: the text of its `<init_from>` (1.4), or of
     * the `<ref>` inside it (1.5). Only inside `<image>`: a 1.4 effect's
     * `<surface><init_from>` holds an image's id, not a file.
     *
     * Linear: every search starts where the last one ended, and a tag that never closes
     * ends the scan. Mirrors colladaImageFiles() in src/loaders/multiFileHelpers.js.
     *
     * @return list<string> the values as written
     */
    private static function colladaImageFiles(string $document): array
    {
        $lower = strtolower($document);
        $values = [];
        // The first <init_from at or after the last search, kept across <image> blocks: a
        // search per block would run to the end of the document each time, which is
        // quadratic in a document of many images without one. False once there is none.
        $nextInit = -1;
        $at = 0;
        while (($start = strpos($lower, '<image', $at)) !== false) {
            $at = $start + 6;
            // <image>, <image id=…>; not <imager> or <image_…>
            if (!self::endsTagName($lower, $at)) {
                continue;
            }
            $openEnd = strpos($lower, '>', $start);
            if ($openEnd === false) {
                break;
            }
            if ($lower[$openEnd - 1] === '/') {
                $at = $openEnd + 1;
                continue;
            }
            $close = strpos($lower, '</image', $openEnd);
            if ($close === false) {
                break;
            }
            $p = $openEnd + 1;
            while (true) {
                if ($nextInit !== false && $nextInit < $p) {
                    $nextInit = strpos($lower, '<init_from', $p);
                }
                $init = $nextInit;
                if ($init === false || $init >= $close) {
                    break;
                }
                $tagEnd = strpos($lower, '>', $init);
                if ($tagEnd === false || $tagEnd >= $close) {
                    break;
                }
                $textStart = $tagEnd + 1;
                $textEnd = strpos($lower, '<', $textStart);
                if ($textEnd !== false && $textEnd < $close
                    && trim(substr($document, $textStart, $textEnd - $textStart)) === ''
                    && substr($lower, $textEnd, 4) === '<ref'
                    && self::endsTagName($lower, $textEnd + 4)) {
                    $refEnd = strpos($lower, '>', $textEnd);
                    if ($refEnd === false || $refEnd >= $close) {
                        break;
                    }
                    $textStart = $refEnd + 1;
                    $textEnd = strpos($lower, '<', $textStart);
                }
                if ($textEnd === false || $textEnd > $close) {
                    break;
                }
                $values[] = substr($document, $textStart, $textEnd - $textStart);
                $p = $textEnd;
            }
            $at = $close + 7;
        }

        return $values;
    }

    /** Whether the byte at $at ends a tag name: blank, `/` or `>` (so `<image>`, not `<imager>`). */
    private static function endsTagName(string $document, int $at): bool
    {
        return strspn($document, " \t\r\n\f/>", $at, 1) === 1;
    }

    /**
     * The names in the `url` of each X3D `<ImageTexture>`, the only texture node the
     * viewer reads; not `<ImageTexture3D>`, nor the `url` of an Anchor, Inline, AudioClip
     * or Script. `url` is an MFString: quoted alternatives in order, written
     * `url='"a.png" "b.png"'` or entity-encoded; some exporters write a bare name.
     *
     * Linear: each start tag is walked once to its first unquoted `>`, and one that never
     * closes ends the scan rather than being retried from the next `<ImageTexture`.
     * Mirrors x3dTextureUrls() in src/loaders/multiFileHelpers.js.
     *
     * @return list<string> the names, entity-decoded and trimmed
     */
    private static function x3dTextureUrls(string $document): array
    {
        $lower = strtolower($document);
        $length = strlen($document);
        $values = [];
        $at = 0;
        while (($start = strpos($lower, '<imagetexture', $at)) !== false) {
            $at = $start + 13;
            if (!self::endsTagName($lower, $at)) {
                continue;
            }
            // The start tag, up to the first > outside a quoted value
            $end = $at;
            while (true) {
                $end += strcspn($document, "\"'>", $end);
                if ($end >= $length) {
                    return $values;
                }
                if ($document[$end] === '>') {
                    break;
                }
                $closeQuote = strpos($document, $document[$end], $end + 1);
                if ($closeQuote === false) {
                    return $values;
                }
                $end = $closeQuote + 1;
            }
            $url = self::attributeValue(substr($document, $at, $end - $at), 'url');
            $at = $end + 1;
            if ($url === null) {
                continue;
            }
            $list = trim(html_entity_decode($url, ENT_QUOTES | ENT_XML1, 'UTF-8'), self::BLANKS);
            if (str_contains($list, '"')) {
                // "a.png" "b b.png": every quoted entry whole, spaces included
                $parts = explode('"', $list);
                for ($i = 1; $i + 1 < count($parts); $i += 2) {
                    $values[] = $parts[$i];
                }
            } else {
                foreach (preg_split('/\s+/', $list) ?: [] as $value) {
                    $values[] = $value;
                }
            }
        }

        return array_values(array_filter(
            array_map(static fn (string $value): string => trim($value, self::BLANKS), $values),
            static fn (string $value): bool => $value !== '',
        ));
    }

    /**
     * The value of one attribute in the inside of a start tag, read attribute by
     * attribute so a name inside another attribute's value is never taken for one.
     */
    private static function attributeValue(string $tag, string $wanted): ?string
    {
        $blank = " \t\r\n\f";
        $length = strlen($tag);
        $i = 0;
        while ($i < $length) {
            $i += strspn($tag, $blank . '/', $i);
            if ($i >= $length) {
                break;
            }
            $nameStart = $i;
            $i += strcspn($tag, $blank . '=/>', $i);
            $name = substr($tag, $nameStart, $i - $nameStart);
            $i += strspn($tag, $blank, $i);
            if ($i >= $length || $tag[$i] !== '=') {
                if ($i === $nameStart) {
                    $i++;
                }
                continue;
            }
            $i++;
            $i += strspn($tag, $blank, $i);
            if ($i >= $length) {
                break;
            }
            $quote = $tag[$i];
            if ($quote === '"' || $quote === "'") {
                $close = strpos($tag, $quote, $i + 1);
                if ($close === false) {
                    return null;
                }
                $value = substr($tag, $i + 1, $close - $i - 1);
                $i = $close + 1;
            } else {
                $span = strcspn($tag, $blank, $i);
                $value = substr($tag, $i, $span);
                $i += $span;
            }
            if (strtolower($name) === $wanted) {
                return $value;
            }
        }

        return null;
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
            // separators folded, an absolute path reduced to its name, schemes refused,
            // `..` collapsed.
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
                $this->register($map, self::uriDecoded($entry['uri']));
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
        $value = trim($value, self::BLANKS);
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
     * @param string                $directory folder a relative path is relative to, inside
     *                                         the model's own; `.` for the model's folder itself
     *
     * @return string|null the normalised path that was registered, or null if rejected
     */
    private function register(array &$map, string $rawPath, string $directory = '.'): ?string
    {
        $path = $this->normalise($rawPath, $directory);
        if ($path === null) {
            return null;
        }

        $key = mb_strtolower(basename($path));
        // First declaration wins, so a later line cannot redirect an already-known name:
        // a bare name an absolute path fell back to does not replace `textures/wood.png`
        // declared before it, nor the other way round.
        $map[$key] ??= $path;

        return $map[$key];
    }

    /**
     * Reduce a declared reference to a path inside the model's own folder, or reject it.
     *
     * Mirrors normaliseRef() in src/loaders/textureReferences.js: the client must ask for
     * exactly the names this serves. Change one, change both.
     *
     * An absolute path — a drive letter, a leading slash, a UNC path — or a `file:` URL
     * names a place on the author's machine, so it falls back to its bare file name in
     * the model's own folder, whichever file declared it. The value registered then has no
     * directory, and resolve() looks for it in the model's folder alone; the directories
     * the path named are never followed. Any other scheme is not a file beside the model.
     * A relative path is relative to $directory, has `..` collapsed, and is rejected if it
     * climbs out of the model's folder, holds a NUL, which no file name does, or has a
     * segment made only of dots and spaces other than `.` and `..` (see
     * onlyDotsAndSpaces()). Only the ASCII blanks are trimmed (see BLANKS).
     */
    private function normalise(string $rawPath, string $directory = '.'): ?string
    {
        // Exporters on Windows write backslashes; Nextcloud paths use forward slashes.
        $path = str_replace('\\', '/', trim($rawPath, self::BLANKS));

        if ($path === '') {
            return null;
        }
        if (self::isLocalAbsolute($path)) {
            return self::nameOnly($path);
        }
        // `data:`, `http:`, `blob:` — anything else with a scheme is not a file beside the model.
        if (preg_match('#^[a-z][a-z0-9+.\-]*:#i', $path) === 1) {
            return null;
        }
        if ($directory !== '.') {
            $path = $directory . '/' . $path;
        }

        $segments = [];
        foreach (explode('/', $path) as $segment) {
            if ($segment === '' || $segment === '.') {
                continue;
            }
            if (str_contains($segment, "\0")) {
                return null;
            }
            if ($segment !== '..' && self::onlyDotsAndSpaces($segment)) {
                return null;
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

    /**
     * A drive letter (`C:`), a leading slash (UNC included, once `\` is folded), or a
     * `file:` URL. Fixed-length tests at the start of the string.
     *
     * @param string $path trimmed, with `/` separators
     */
    private static function isLocalAbsolute(string $path): bool
    {
        return str_starts_with($path, '/') || self::isFileUrl($path) || self::hasDriveLetter($path);
    }

    private static function isFileUrl(string $path): bool
    {
        return strncasecmp($path, 'file:', 5) === 0;
    }

    /** `C:` and the like. A single letter is never a URL scheme anyone uses. */
    private static function hasDriveLetter(string $path): bool
    {
        return strlen($path) >= 2 && ctype_alpha($path[0]) && $path[1] === ':';
    }

    /**
     * The file name an absolute path or `file:` URL falls back to, or null when it names
     * none: empty, `.`, `..`, or holding a separator once decoded.
     *
     * A `file:` URL loses its query and fragment, and its name is percent-decoded once.
     *
     * @param string $path trimmed, with `/` separators, and absolute
     */
    private static function nameOnly(string $path): ?string
    {
        $url = self::isFileUrl($path);
        if ($url) {
            $path = substr($path, 5);
            $path = substr($path, 0, strcspn($path, '?#'));
        } elseif (self::hasDriveLetter($path)) {
            $path = substr($path, 2);
        }

        $slash = strrpos($path, '/');
        $name = $slash === false ? $path : substr($path, $slash + 1);
        if ($url) {
            $name = self::percentDecoded($name);
        }
        if ($name === '' || self::onlyDotsAndSpaces($name) || strpbrk($name, "/\\\0") !== false) {
            return null;
        }

        return $name;
    }

    /**
     * A segment made only of dots and spaces, `...`, `.. ` or `. .`. Windows drops trailing
     * dots and spaces from a name, so storage on a Windows share can read such a segment
     * as `.` or `..`; none is a real folder or file name, so none is followed. Mirrors
     * DOTS_AND_SPACES in src/loaders/textureReferences.js.
     */
    private static function onlyDotsAndSpaces(string $segment): bool
    {
        return $segment !== '' && strspn($segment, '. ') === strlen($segment);
    }

    /**
     * Percent-decoded the way the client's decodeURIComponent() is, which refuses a `%`
     * not followed by two hex digits, and bytes that are not UTF-8, by keeping the text as
     * written. A scan with strpos, linear in the text.
     */
    private static function percentDecoded(string $text): string
    {
        $length = strlen($text);
        $at = 0;
        while (($at = strpos($text, '%', $at)) !== false) {
            if ($at + 2 >= $length || !ctype_xdigit(substr($text, $at + 1, 2))) {
                return $text;
            }
            $at += 3;
        }
        $decoded = rawurldecode($text);

        return mb_check_encoding($decoded, 'UTF-8') ? $decoded : $text;
    }

    /**
     * A URI-encoded reference decoded before it is normalised, as glTF, COLLADA and X3D
     * write theirs, the way the client's decodeURIComponent() decodes it: a stray `%` or
     * bytes that are not UTF-8 keep the value as written. A `file:` URL is left as it is:
     * normalise() decodes its name, and decoding twice would turn a literal `%20` in a
     * file name into a space.
     */
    private static function uriDecoded(string $value): string
    {
        return self::isFileUrl(ltrim($value, self::BLANKS)) ? $value : self::percentDecoded($value);
    }

    /**
     * Reached through locate(), not get(), for the same reason resolve() is.
     *
     * An OBJ's textures are named by its material, so a `mtllib` that misses finds no
     * material and therefore declares no textures at all — the model stays untextured
     * even though every file is present. Matching the map's case only where it has to be
     * matched keeps that from happening.
     */
    private function readableSibling(Folder $parent, string $path, string $extension): ?File
    {
        $node = $this->pathLocator->locate($parent, $path);

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
        if (preg_match_all($pattern, $this->head($file, $maxBytes), $matches) === false
            || preg_last_error() !== PREG_NO_ERROR) {
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
