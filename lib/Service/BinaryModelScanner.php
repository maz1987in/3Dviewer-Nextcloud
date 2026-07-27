<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

/**
 * Texture declarations from the two binary model formats.
 *
 * OBJ, glTF, COLLADA and X3D all name their textures in readable text, so a public
 * client can parse them and ask for each by name. FBX and 3DS keep theirs in binary
 * structures — which is why they were the last two formats rendering untextured on a
 * share, with nothing for the dependency route to authorise against.
 *
 * Both formats are walked structurally rather than searched for their marker bytes. A
 * model's mesh data is supplied by whoever uploaded it, and `RelativeFilename` occurring
 * inside a vertex array is not a declaration — treating it as one would let a crafted
 * model name any file beside it. Walking also keeps a large mesh cheap: property lists
 * and geometry chunks are stepped over by their declared length, never read.
 */
final class BinaryModelScanner
{
    /**
     * How many textures one model may declare.
     *
     * A crafted document can hold hundreds of thousands of declarations, and each one
     * costs work on a route that has no rate limit. Real exporters emit a handful.
     */
    public const MAX_TEXTURES = 64;

    /**
     * Unconditional bound on the walk.
     *
     * The per-record checks below reject the shapes that would stall a cursor, but they
     * are checks on values the document supplies. This does not depend on getting every
     * one of them right.
     */
    private const MAX_NODES = 50000;

    private const MAX_DEPTH = 16;

    private const FBX_MAGIC = 'Kaydara FBX Binary';

    /** 21-byte magic, the 0x1A 0x00 pair, then a 4-byte version. */
    private const FBX_HEADER_BYTES = 27;

    private const FBX_VERSION_OFFSET = 23;

    /** FBX 7.5 widened the three node-record length fields from 32 to 64 bits. */
    private const FBX_WIDE_VERSION = 7500;

    /** `RelativeFilename: "textures/wood.png"` in an ASCII document. */
    private const FBX_ASCII_RELATIVE = '/^[^\S\r\n]*RelativeFilename\s*:\s*"([^"]*)"/m';

    private const THREE_DS_MAIN = 0x4d4d;

    private const THREE_DS_MAPNAME = 0xa300;

    /**
     * Chunks worth descending into: the file root, the editor block, a material, and the
     * texture slots a material can carry. Everything else — meshes, keyframes — is
     * stepped over whole, so bytes inside it are never read as chunks.
     */
    private const THREE_DS_CONTAINERS = [
        0x4d4d, // M3DMAGIC
        0x3d3d, // MDATA
        0xafff, // MAT_ENTRY
        0xa200, // MAT_TEXMAP
        0xa204, // MAT_SPECMAP
        0xa210, // MAT_OPACMAP
        0xa220, // MAT_REFLMAP
        0xa230, // MAT_BUMPMAP
        0xa33a, // MAT_TEX2MAP
        0xa33c, // MAT_SHINMAP
        0xa33e, // MAT_SELFIMAP
    ];

    /** An ASCII FBX declares its textures in the header; the rest is vertex text. */
    private const ASCII_SCAN_BYTES = 4 * 1024 * 1024;

    /** Only reached when the storage hands back a stream that cannot seek. */
    private const UNSEEKABLE_SCAN_BYTES = 16 * 1024 * 1024;

    /** @var resource */
    private $handle;

    private bool $seekable;

    /** Holds the model only when the stream cannot seek; empty otherwise. */
    private string $buffer = '';

    private int $size;

    private int $budget = self::MAX_NODES;

    /** @var list<string> */
    private array $found = [];

    /**
     * Seeking is what keeps this cheap — a 200 MB mesh costs a few hundred small reads
     * rather than 200 MB through memory, on a route that reparses per dependency
     * request. Object storage can hand back a stream that will not seek, so that case
     * falls back to a bounded read; declarations past the bound are simply not served.
     *
     * @param resource $handle
     */
    private function __construct($handle)
    {
        $this->handle = $handle;

        $meta = stream_get_meta_data($handle);
        $this->seekable = ($meta['seekable'] ?? false) === true && fseek($handle, 0, SEEK_END) === 0;

        if ($this->seekable) {
            $end = ftell($handle);
            $this->size = $end === false ? 0 : $end;

            return;
        }

        $buffer = stream_get_contents($handle, self::UNSEEKABLE_SCAN_BYTES);
        $this->buffer = $buffer === false ? '' : $buffer;
        $this->size = strlen($this->buffer);
    }

    /**
     * Texture paths an FBX declares, in document order.
     *
     * Only `RelativeFilename` is read. FBX also carries an absolute `FileName`, but an
     * absolute path is rejected downstream anyway, and guessing at its basename would
     * authorise names the document never pointed at.
     *
     * @param resource $handle
     *
     * @return list<string>
     */
    public static function fbxTexturePaths($handle): array
    {
        return (new self($handle))->scanFbx();
    }

    /**
     * Texture paths a 3DS declares, in document order.
     *
     * @param resource $handle
     *
     * @return list<string>
     */
    public static function threeDsTexturePaths($handle): array
    {
        return (new self($handle))->scanThreeDs();
    }

    /** @return list<string> */
    private function scanFbx(): array
    {
        if ($this->size < self::FBX_HEADER_BYTES) {
            return $this->scanAsciiFbx();
        }

        $header = $this->read(0, self::FBX_HEADER_BYTES);
        if (substr($header, 0, strlen(self::FBX_MAGIC)) !== self::FBX_MAGIC) {
            return $this->scanAsciiFbx();
        }

        $version = unpack('V', substr($header, self::FBX_VERSION_OFFSET, 4));
        $wide = is_array($version) && (int) $version[1] >= self::FBX_WIDE_VERSION;

        $this->readFbxNodeList(self::FBX_HEADER_BYTES, $this->size, $wide, 0);

        return $this->found;
    }

    /** @return list<string> */
    private function scanAsciiFbx(): array
    {
        $text = $this->read(0, min($this->size, self::ASCII_SCAN_BYTES));

        /** @var array<int, array<int, string>> $matches */
        $matches = [];
        if (preg_match_all(self::FBX_ASCII_RELATIVE, $text, $matches) < 1) {
            return [];
        }

        return array_slice($matches[1], 0, self::MAX_TEXTURES);
    }

    /** @return list<string> */
    private function scanThreeDs(): array
    {
        if ($this->size < 6) {
            return [];
        }

        $magic = unpack('v', $this->read(0, 2));
        if (!is_array($magic) || (int) $magic[1] !== self::THREE_DS_MAIN) {
            return [];
        }

        $this->read3dsChunks(0, $this->size, 0);

        return $this->found;
    }

    private function read(int $offset, int $length): string
    {
        if ($length <= 0 || $offset < 0) {
            return '';
        }

        if (!$this->seekable) {
            return substr($this->buffer, $offset, $length);
        }

        if (fseek($this->handle, $offset) !== 0) {
            return '';
        }
        $data = fread($this->handle, $length);

        return $data === false ? '' : $data;
    }

    private function exhausted(): bool
    {
        return $this->budget < 1 || count($this->found) >= self::MAX_TEXTURES;
    }

    /**
     * Walk a run of sibling node records.
     */
    private function readFbxNodeList(int $start, int $end, bool $wide, int $depth): void
    {
        if ($depth > self::MAX_DEPTH) {
            return;
        }

        $fieldSize = $wide ? 8 : 4;
        $headerSize = $fieldSize * 3 + 1;
        $format = $wide ? 'Pend/Pcount/Pbytes' : 'Vend/Vcount/Vbytes';
        $cursor = $start;

        while ($cursor + $headerSize <= $end && !$this->exhausted()) {
            $this->budget--;

            $header = $this->read($cursor, $headerSize);
            if (strlen($header) < $headerSize) {
                return;
            }

            $fields = unpack($format, substr($header, 0, $fieldSize * 3));
            if (!is_array($fields)) {
                return;
            }
            $endOffset = (int) $fields['end'];
            $propertyCount = (int) $fields['count'];
            $propertyBytes = (int) $fields['bytes'];
            $nameLength = ord($header[$fieldSize * 3]);

            // A record of all zeroes terminates the list.
            if ($endOffset === 0) {
                return;
            }
            // Anything that would not advance the cursor, or reaches past this run, is
            // malformed — stop rather than resynchronise onto whatever follows.
            if ($endOffset <= $cursor || $endOffset > $end) {
                return;
            }

            $nameStart = $cursor + $headerSize;
            $nameEnd = $nameStart + $nameLength;
            if ($nameEnd > $end) {
                return;
            }

            $name = $this->read($nameStart, $nameLength);
            $propertiesEnd = $nameEnd + $propertyBytes;

            if ($name === 'RelativeFilename' && $propertyCount > 0 && $propertiesEnd <= $end) {
                $value = $this->readFbxStringProperty($nameEnd, $propertiesEnd);
                if ($value !== null) {
                    $this->found[] = $value;
                }
            } elseif ($propertiesEnd < $endOffset) {
                // Stepping over the property list is what keeps a large mesh cheap.
                $this->readFbxNodeList($propertiesEnd, $endOffset, $wide, $depth + 1);
            }

            $cursor = $endOffset;
        }
    }

    /**
     * The value of a node's first property, when that property is a string.
     */
    private function readFbxStringProperty(int $start, int $end): ?string
    {
        // 'S' — a 4-byte length then the bytes. Every other type tag is a number or an
        // array, neither of which names a file.
        if ($start + 5 > $end) {
            return null;
        }

        $head = $this->read($start, 5);
        if (strlen($head) < 5 || $head[0] !== 'S') {
            return null;
        }

        $parsed = unpack('V', substr($head, 1, 4));
        $length = is_array($parsed) ? (int) $parsed[1] : 0;
        if ($length < 1 || $start + 5 + $length > $end) {
            return null;
        }

        return $this->read($start + 5, $length);
    }

    private function read3dsChunks(int $start, int $end, int $depth): void
    {
        if ($depth > self::MAX_DEPTH) {
            return;
        }

        $cursor = $start;

        while ($cursor + 6 <= $end && !$this->exhausted()) {
            $this->budget--;

            $header = $this->read($cursor, 6);
            if (strlen($header) < 6) {
                return;
            }

            $fields = unpack('vid/Vlength', $header);
            if (!is_array($fields)) {
                return;
            }
            $id = (int) $fields['id'];
            $length = (int) $fields['length'];

            // A chunk shorter than its own header advances the cursor by nothing; one
            // running past the end is truncated. Either way the structure ends here.
            if ($length < 6 || $cursor + $length > $end) {
                return;
            }

            if ($id === self::THREE_DS_MAPNAME) {
                $this->found[] = self::readCString($this->read($cursor + 6, $length - 6));
            } elseif (in_array($id, self::THREE_DS_CONTAINERS, true)) {
                $this->read3dsChunks($cursor + 6, $cursor + $length, $depth + 1);
            }

            $cursor += $length;
        }
    }

    private static function readCString(string $raw): string
    {
        $stop = strpos($raw, chr(0));

        return $stop === false ? $raw : substr($raw, 0, $stop);
    }
}
