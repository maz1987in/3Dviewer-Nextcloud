<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Service\ModelDependencyResolver;
use OCA\ThreeDViewer\Service\PathLocator;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\NotFoundException;
use PHPUnit\Framework\TestCase;

/**
 * Anonymous visitors cannot reach the file-listing API, so there is no way to turn
 * "the texture my material names" into a file id. The public routes therefore have to
 * resolve dependencies by name — and the moment a name is enough to fetch a file, the
 * question becomes *which* names.
 *
 * The answer this class enforces: only what the shared model itself declares. A
 * single-file share exposes exactly one file; without that rule, a share link to any
 * OBJ would turn into a name-guessing oracle over the owner's whole folder.
 */
class ModelDependencyResolverTest extends TestCase
{
    private ModelDependencyResolver $resolver;

    protected function setUp(): void
    {
        if (!interface_exists(File::class)) {
            $this->markTestSkipped('OCP interfaces not available');
        }
        $this->resolver = new ModelDependencyResolver(new PathLocator());
    }

    public function testServesATextureTheMaterialDeclares(): void
    {
        $texture = $this->fileNamed('wood.png');
        $model = $this->objModel(
            "mtllib chair.mtl\nv 0 0 0\n",
            [
                'chair.mtl' => $this->fileNamed('chair.mtl', "newmtl seat\nmap_Kd wood.png\n"),
                'wood.png' => $texture,
            ],
        );

        $this->assertSame($texture, $this->resolver->resolve($model, 'wood.png'));
    }

    public function testServesTheMaterialFileItself(): void
    {
        $mtl = $this->fileNamed('chair.mtl', "newmtl seat\n");
        $model = $this->objModel("mtllib chair.mtl\n", ['chair.mtl' => $mtl]);

        $this->assertSame($mtl, $this->resolver->resolve($model, 'chair.mtl'));
    }

    /**
     * The rule that keeps a single-file share from leaking its neighbours.
     */
    public function testRefusesASiblingTheModelNeverReferences(): void
    {
        $model = $this->objModel(
            "mtllib chair.mtl\n",
            [
                'chair.mtl' => $this->fileNamed('chair.mtl', "newmtl seat\nmap_Kd wood.png\n"),
                'wood.png' => $this->fileNamed('wood.png'),
                'passport-scan.png' => $this->fileNamed('passport-scan.png'),
            ],
        );

        $this->expectException(NotFoundException::class);
        $this->resolver->resolve($model, 'passport-scan.png');
    }

    public function testFollowsTheSubdirectoryTheMaterialNames(): void
    {
        $texture = $this->fileNamed('wood.png');
        $model = $this->objModel(
            "mtllib chair.mtl\n",
            [
                'chair.mtl' => $this->fileNamed('chair.mtl', "map_Kd textures/wood.png\n"),
                'textures/wood.png' => $texture,
            ],
        );

        // The client only ever knows the basename — it strips the path when parsing
        // the MTL — so the server has to remember where the material pointed.
        $this->assertSame($texture, $this->resolver->resolve($model, 'wood.png'));
    }

    public function testTreatsWindowsSeparatorsAsPathSeparators(): void
    {
        $texture = $this->fileNamed('wood.png');
        $model = $this->objModel(
            "mtllib chair.mtl\n",
            [
                'chair.mtl' => $this->fileNamed('chair.mtl', "map_Kd textures\\wood.png\n"),
                'textures/wood.png' => $texture,
            ],
        );

        $this->assertSame($texture, $this->resolver->resolve($model, 'wood.png'));
    }

    public function testRefusesADeclaredPathThatClimbsOutOfTheModelsFolder(): void
    {
        $model = $this->objModel(
            "mtllib chair.mtl\n",
            [
                'chair.mtl' => $this->fileNamed('chair.mtl', "map_Kd ../../private/key.png\n"),
                '../../private/key.png' => $this->fileNamed('key.png'),
            ],
        );

        $this->expectException(NotFoundException::class);
        $this->resolver->resolve($model, 'key.png');
    }

    public function testRefusesASeparatorInTheRequestedName(): void
    {
        $model = $this->objModel(
            "mtllib chair.mtl\n",
            ['chair.mtl' => $this->fileNamed('chair.mtl', "map_Kd wood.png\n")],
        );

        $this->expectException(NotFoundException::class);
        $this->resolver->resolve($model, '../chair.mtl');
    }

    public function testMatchesTheRequestedNameCaseInsensitively(): void
    {
        $texture = $this->fileNamed('Wood.PNG');
        $model = $this->objModel(
            "mtllib chair.mtl\n",
            [
                'chair.mtl' => $this->fileNamed('chair.mtl', "map_Kd Wood.PNG\n"),
                'Wood.PNG' => $texture,
            ],
        );

        $this->assertSame($texture, $this->resolver->resolve($model, 'wood.png'));
    }

    /**
     * `map_Kd -s 1 1 1 wood.png` is legal MTL: options precede the filename and always
     * start with a dash. Taking the whole rest of the line would ask for a file called
     * "-s 1 1 1 wood.png".
     */
    public function testSkipsMaterialMapOptionsBeforeTheFilename(): void
    {
        $texture = $this->fileNamed('wood.png');
        $model = $this->objModel(
            "mtllib chair.mtl\n",
            [
                'chair.mtl' => $this->fileNamed('chair.mtl', "map_Kd -s 1 1 1 -o 0 0 0 wood.png\n"),
                'wood.png' => $texture,
            ],
        );

        $this->assertSame($texture, $this->resolver->resolve($model, 'wood.png'));
    }

    public function testKeepsSpacesInAFilenameThatHasNoOptions(): void
    {
        $texture = $this->fileNamed('oak floor.png');
        $model = $this->objModel(
            "mtllib chair.mtl\n",
            [
                'chair.mtl' => $this->fileNamed('chair.mtl', "map_Kd oak floor.png\n"),
                'oak floor.png' => $texture,
            ],
        );

        $this->assertSame($texture, $this->resolver->resolve($model, 'oak floor.png'));
    }

    public function testCollectsBumpAndReflectionMapsToo(): void
    {
        $bump = $this->fileNamed('normal.png');
        $model = $this->objModel(
            "mtllib chair.mtl\n",
            [
                'chair.mtl' => $this->fileNamed('chair.mtl', "bump normal.png\nrefl env.png\n"),
                'normal.png' => $bump,
            ],
        );

        $this->assertSame($bump, $this->resolver->resolve($model, 'normal.png'));
    }

    public function testRefusesADeclaredNameThatIsNotAServableDependency(): void
    {
        $model = $this->objModel(
            "mtllib chair.mtl\n",
            [
                'chair.mtl' => $this->fileNamed('chair.mtl', "map_Kd notes.txt\n"),
                'notes.txt' => $this->fileNamed('notes.txt'),
            ],
        );

        $this->expectException(NotFoundException::class);
        $this->resolver->resolve($model, 'notes.txt');
    }

    public function testSurvivesAMaterialThatIsNotThere(): void
    {
        $model = $this->objModel("mtllib gone.mtl\n", []);

        $this->expectException(NotFoundException::class);
        $this->resolver->resolve($model, 'gone.mtl');
    }

    public function testServesGltfBuffersAndImages(): void
    {
        $buffer = $this->fileNamed('scene.bin');
        $model = $this->gltfModel(
            json_encode([
                'buffers' => [['uri' => 'scene.bin']],
                'images' => [['uri' => 'textures/diffuse.png']],
            ], JSON_THROW_ON_ERROR),
            [
                'scene.bin' => $buffer,
                'textures/diffuse.png' => $this->fileNamed('diffuse.png'),
            ],
        );

        $this->assertSame($buffer, $this->resolver->resolve($model, 'scene.bin'));
        $this->assertSame('diffuse.png', $this->resolver->resolve($model, 'diffuse.png')->getName());
    }

    public function testDecodesPercentEscapesInGltfUris(): void
    {
        $texture = $this->fileNamed('oak floor.png');
        $model = $this->gltfModel(
            json_encode(['images' => [['uri' => 'oak%20floor.png']]], JSON_THROW_ON_ERROR),
            ['oak floor.png' => $texture],
        );

        $this->assertSame($texture, $this->resolver->resolve($model, 'oak floor.png'));
    }

    public function testIgnoresEmbeddedAndRemoteGltfUris(): void
    {
        $model = $this->gltfModel(
            json_encode([
                'buffers' => [['uri' => 'data:application/octet-stream;base64,AAAA']],
                'images' => [['uri' => 'https://example.invalid/leak.png']],
            ], JSON_THROW_ON_ERROR),
            ['leak.png' => $this->fileNamed('leak.png')],
        );

        $this->expectException(NotFoundException::class);
        $this->resolver->resolve($model, 'leak.png');
    }

    public function testSurvivesUnparseableGltf(): void
    {
        $model = $this->gltfModel('{ this is not json', ['scene.bin' => $this->fileNamed('scene.bin')]);

        $this->expectException(NotFoundException::class);
        $this->resolver->resolve($model, 'scene.bin');
    }

    /**
     * STL, PLY, GLB and friends carry their data inline. Declaring nothing means
     * nothing next to them is reachable.
     */
    public function testASingleFileFormatDeclaresNothing(): void
    {
        $model = $this->modelNamed('part.stl', 'solid part', ['secret.png' => $this->fileNamed('secret.png')]);

        $this->expectException(NotFoundException::class);
        $this->resolver->resolve($model, 'secret.png');
    }

    /** @param array<string, File> $siblings */
    private function objModel(string $content, array $siblings): File
    {
        return $this->modelNamed('chair.obj', $content, $siblings);
    }

    /** @param array<string, File> $siblings */
    private function gltfModel(string $content, array $siblings): File
    {
        return $this->modelNamed('scene.gltf', $content, $siblings);
    }

    /** @param array<string, File> $siblings */
    private function modelNamed(string $name, string $content, array $siblings): File
    {
        $model = $this->fileNamed($name, $content);
        $model->method('getParent')->willReturn($this->folderWith($siblings));

        return $model;
    }

    /** @param array<string, File> $nodes */
    private function folderWith(array $nodes): Folder
    {
        $folder = $this->createMock(Folder::class);
        $folder->method('get')->willReturnCallback(
            static function (string $path) use ($nodes): File {
                $key = ltrim($path, '/');
                if (!isset($nodes[$key])) {
                    throw new NotFoundException('no node at ' . $key);
                }

                return $nodes[$key];
            }
        );
        // Only the top level, since these mocks are keyed by whole path rather than
        // arranged as a tree. Left unstubbed it returned null, and the resolver's
        // case-insensitive fallback iterated that — a warning the real interface, which
        // declares an array return, could never produce.
        $folder->method('getDirectoryListing')->willReturn(
            array_values(array_filter(
                $nodes,
                static fn (string $path): bool => !str_contains($path, '/'),
                ARRAY_FILTER_USE_KEY,
            )),
        );

        return $folder;
    }

    public function testStopsScanningAfterAReasonableNumberOfMaterials(): void
    {
        // Each distinct mtllib name costs one storage lookup, and ~226,000 of them fit
        // inside the model scan window. Left unbounded, a single crafted OBJ turns every
        // /dep/{name} request on its public share into hundreds of thousands of lookups —
        // and the attacker can be the sharer, so no victim has to cooperate.
        $declared = 500;
        $lines = '';
        for ($i = 0; $i < $declared; $i++) {
            $lines .= "mtllib m{$i}.mtl\n";
        }

        // Two kinds of storage work, counted separately: a material is fetched by path,
        // and a fetch that misses is followed by a folder listing to retry the name
        // without regard to case. Counting only the fetches would have let the listings
        // grow unbounded behind a guard that still read as green.
        $fetches = 0;
        $listings = 0;
        $folder = $this->createMock(Folder::class);
        $folder->method('get')->willReturnCallback(
            static function (string $path) use (&$fetches): File {
                $fetches++;

                throw new NotFoundException('no node at ' . $path);
            }
        );
        $folder->method('getDirectoryListing')->willReturnCallback(
            static function () use (&$listings): array {
                $listings++;

                return [];
            }
        );

        $model = $this->fileNamed('chair.obj', $lines);
        $model->method('getParent')->willReturn($folder);

        try {
            $this->resolver->resolve($model, 'wood.png');
        } catch (NotFoundException) {
            // Expected — nothing resolves. The cost of finding that out is the point.
        }

        $this->assertLessThanOrEqual(
            ModelDependencyResolver::MAX_MATERIALS,
            $fetches,
            "fetched {$fetches} materials for a model declaring {$declared}"
        );
        $this->assertLessThanOrEqual(
            ModelDependencyResolver::MAX_MATERIALS,
            $listings,
            "listed the folder {$listings} times for a model declaring {$declared}"
        );
    }

    public function testServesATextureACollodaFileDeclares(): void
    {
        $texture = $this->fileNamed('wood.png');
        $model = $this->modelNamed(
            'chair.dae',
            '<?xml version="1.0"?><COLLADA><library_images>'
            . '<image id="wood"><init_from>textures/wood.png</init_from></image>'
            . '</library_images></COLLADA>',
            ['textures/wood.png' => $texture],
        );

        $this->assertSame($texture, $this->resolver->resolve($model, 'wood.png'));
    }

    public function testHandlesTheCollada15RefForm(): void
    {
        // COLLADA 1.5 wraps the path in <ref>; 1.4 puts it directly in <init_from>.
        $texture = $this->fileNamed('wood.png');
        $model = $this->modelNamed(
            'chair.dae',
            '<COLLADA><library_images><image><init_from><ref>wood.png</ref></init_from>'
            . '</image></library_images></COLLADA>',
            ['wood.png' => $texture],
        );

        $this->assertSame($texture, $this->resolver->resolve($model, 'wood.png'));
    }

    public function testServesATextureAnX3dFileDeclares(): void
    {
        $texture = $this->fileNamed('wood.png');
        $model = $this->modelNamed(
            'chair.x3d',
            '<X3D><Scene><Shape><Appearance>'
            . '<ImageTexture url=\'"textures/wood.png"\'/>'
            . '</Appearance></Shape></Scene></X3D>',
            ['textures/wood.png' => $texture],
        );

        $this->assertSame($texture, $this->resolver->resolve($model, 'wood.png'));
    }

    public function testTakesEveryUrlInAnX3dFallbackList(): void
    {
        // X3D url is an MFString: a whitespace-separated list of alternatives, tried
        // in order. Any of them may be the one that exists beside the model.
        $texture = $this->fileNamed('local.png');
        $model = $this->modelNamed(
            'chair.x3d',
            '<X3D><ImageTexture url=\'"https://example.invalid/remote.png" "local.png"\'/></X3D>',
            ['local.png' => $texture],
        );

        $this->assertSame($texture, $this->resolver->resolve($model, 'local.png'));
    }

    public function testRefusesAnUndeclaredSiblingOfAColladaFile(): void
    {
        $model = $this->modelNamed(
            'chair.dae',
            '<COLLADA><library_images><image><init_from>wood.png</init_from></image>'
            . '</library_images></COLLADA>',
            ['wood.png' => $this->fileNamed('wood.png'), 'private.png' => $this->fileNamed('private.png')],
        );

        $this->expectException(NotFoundException::class);
        $this->resolver->resolve($model, 'private.png');
    }

    public function testIgnoresRemoteAndEmbeddedXmlTextureUris(): void
    {
        // The siblings below sit at the paths a leaked scheme would normalise to
        // (`https://a/b` loses one slash and becomes the relative `https:/a/b`). Without
        // them the request would fail merely because the folder is empty, and the test
        // would pass whether or not the scheme was actually rejected.
        $model = $this->modelNamed(
            'chair.dae',
            '<COLLADA><library_images>'
            . '<image><init_from>https://example.invalid/wood.png</init_from></image>'
            . '<image><init_from>data:image/png;base64,AAAA</init_from></image>'
            . '</library_images></COLLADA>',
            [
                'https:/example.invalid/wood.png' => $this->fileNamed('wood.png'),
                'data:image/png;base64,AAAA' => $this->fileNamed('AAAA.png'),
            ],
        );

        $this->expectException(NotFoundException::class);
        $this->resolver->resolve($model, 'wood.png');
    }

    // FBX and 3DS name their textures in binary structures rather than in readable text,
    // which is why they were the last two formats rendering untextured on a share: the
    // route had no declaration to authorise against. Both are walked structurally — a
    // name occurring inside mesh data is not a declaration, and the tests below plant
    // exactly that.

    public function testServesATextureAnFbxDeclares(): void
    {
        $texture = $this->fileNamed('wood.png');
        $model = $this->modelNamed(
            'scene.fbx',
            $this->fbxDocumentWith(['textures/wood.png']),
            ['textures/wood.png' => $texture],
        );

        $this->assertSame($texture, $this->resolver->resolve($model, 'wood.png'));
    }

    public function testNormalisesTheBackslashesAnFbxExporterWrites(): void
    {
        $texture = $this->fileNamed('wood.png');
        $model = $this->modelNamed(
            'scene.fbx',
            $this->fbxDocumentWith(['textures\\wood.png']),
            ['textures/wood.png' => $texture],
        );

        $this->assertSame($texture, $this->resolver->resolve($model, 'wood.png'));
    }

    public function testRefusesASiblingAnFbxNeverDeclares(): void
    {
        $declared = $this->fileNamed('wood.png');
        $model = $this->modelNamed(
            'scene.fbx',
            $this->fbxDocumentWith(['wood.png']),
            [
                'wood.png' => $declared,
                'passport-scan.png' => $this->fileNamed('passport-scan.png'),
            ],
        );

        // Asserted first so the refusal below cannot pass merely because the document
        // was never parsed: an FBX that declares nothing refuses everything.
        $this->assertSame($declared, $this->resolver->resolve($model, 'wood.png'));

        $this->expectException(NotFoundException::class);
        $this->resolver->resolve($model, 'passport-scan.png');
    }

    /**
     * Vertex data is bytes the uploader chose. A scan for the marker text would treat
     * this as a declaration; walking the node structure never reads inside a property.
     */
    public function testIgnoresAFilenamePlantedInsideFbxGeometry(): void
    {
        // Byte-for-byte what a real declaration looks like: the node name, then a string
        // property. Only its position gives it away — it sits inside an array property,
        // where a walker never reads.
        $planted = $this->fbxNode('Geometry', [$this->fbxArrayProperty(
            'RelativeFilename' . $this->fbxStringProperty('evil.png'),
        )], []);
        $texture = $this->fbxNode('Texture', [], [
            $this->fbxNode('RelativeFilename', [$this->fbxStringProperty('real.png')], []),
        ]);
        $model = $this->modelNamed(
            'scene.fbx',
            $this->fbxDocument([$this->fbxNode('Objects', [], [$planted, $texture])]),
            [
                'real.png' => $this->fileNamed('real.png'),
                'evil.png' => $this->fileNamed('evil.png'),
            ],
        );

        $this->expectException(NotFoundException::class);
        $this->resolver->resolve($model, 'evil.png');
    }

    public function testServesATextureAnAsciiFbxDeclares(): void
    {
        $texture = $this->fileNamed('wood.png');
        $model = $this->modelNamed(
            'scene.fbx',
            "Objects:  {\n\tTexture: 1, \"Texture::map\", \"\" {\n"
            . "\t\tRelativeFilename: \"textures/wood.png\"\n\t}\n}\n",
            ['textures/wood.png' => $texture],
        );

        $this->assertSame($texture, $this->resolver->resolve($model, 'wood.png'));
    }

    public function testRefusesAnAbsoluteFbxTexturePath(): void
    {
        $model = $this->modelNamed(
            'scene.fbx',
            $this->fbxDocumentWith(['C:\\Users\\someone\\wood.png']),
            ['C:/Users/someone/wood.png' => $this->fileNamed('wood.png')],
        );

        $this->expectException(NotFoundException::class);
        $this->resolver->resolve($model, 'wood.png');
    }

    public function testServesATextureA3dsDeclares(): void
    {
        $texture = $this->fileNamed('WOOD.JPG');
        $model = $this->modelNamed(
            'scene.3ds',
            $this->threeDsDocumentWith(['WOOD.JPG']),
            ['WOOD.JPG' => $texture],
        );

        $this->assertSame($texture, $this->resolver->resolve($model, 'WOOD.JPG'));
    }

    public function testReadsEvery3dsTextureSlot(): void
    {
        $bump = $this->fileNamed('bump.jpg');
        $model = $this->modelNamed(
            'scene.3ds',
            $this->threeDsDocument([
                $this->chunk(0xa200, '', [$this->chunk(0xa300, "diffuse.jpg\x00")]),
                $this->chunk(0xa230, '', [$this->chunk(0xa300, "bump.jpg\x00")]),
            ]),
            ['diffuse.jpg' => $this->fileNamed('diffuse.jpg'), 'bump.jpg' => $bump],
        );

        $this->assertSame($bump, $this->resolver->resolve($model, 'bump.jpg'));
    }

    /**
     * 0xB000 is a keyframer block, not a material, so it is stepped over whole. A walker
     * that descended into everything would read the map chunk forged in its payload.
     */
    public function testIgnoresAMapChunkForgedInsideANon3dsContainer(): void
    {
        $forged = $this->chunk(0xa300, "evil.jpg\x00");
        $model = $this->modelNamed(
            'scene.3ds',
            $this->chunk(0x4d4d, '', [
                $this->chunk(0xb000, $forged),
                $this->chunk(0x3d3d, '', [$this->chunk(0xafff, '', [
                    $this->chunk(0xa200, '', [$this->chunk(0xa300, "real.jpg\x00")]),
                ])]),
            ]),
            [
                'real.jpg' => $this->fileNamed('real.jpg'),
                'evil.jpg' => $this->fileNamed('evil.jpg'),
            ],
        );

        $this->expectException(NotFoundException::class);
        $this->resolver->resolve($model, 'evil.jpg');
    }

    public function testSurvivesA3dsChunkDeclaringAnImpossibleLength(): void
    {
        $model = $this->modelNamed(
            'scene.3ds',
            pack('v', 0x4d4d) . pack('V', 0) . pack('v', 0x3d3d) . pack('V', 0),
            ['wood.png' => $this->fileNamed('wood.png')],
        );

        $this->expectException(NotFoundException::class);
        $this->resolver->resolve($model, 'wood.png');
    }

    public function testSurvivesATruncatedFbx(): void
    {
        $model = $this->modelNamed(
            'scene.fbx',
            substr($this->fbxDocumentWith(['wood.png']), 0, 40),
            ['wood.png' => $this->fileNamed('wood.png')],
        );

        $this->expectException(NotFoundException::class);
        $this->resolver->resolve($model, 'wood.png');
    }

    // --- binary document builders -------------------------------------------------

    /** An FBX string property: type tag, 4-byte length, bytes. */
    private function fbxStringProperty(string $value): string
    {
        return 'S' . pack('V', strlen($value)) . $value;
    }

    /** A raw byte-array property, used to plant bytes a scanner would trip over. */
    private function fbxArrayProperty(string $bytes): string
    {
        return 'b' . pack('VVV', strlen($bytes), 0, strlen($bytes)) . $bytes;
    }

    /**
     * One node record, deferred until its absolute start offset is known — every record
     * stores the absolute offset of its own end.
     *
     * @param list<string>            $properties encoded properties
     * @param list<callable(int):string> $children  nested node builders
     *
     * @return callable(int): string
     */
    private function fbxNode(string $name, array $properties, array $children): callable
    {
        return static function (int $start) use ($name, $properties, $children): string {
            $propertyBytes = implode('', $properties);
            $cursor = $start + 13 + strlen($name) + strlen($propertyBytes);

            $childBytes = '';
            foreach ($children as $child) {
                $bytes = $child($cursor);
                $childBytes .= $bytes;
                $cursor += strlen($bytes);
            }
            if ($children !== []) {
                $cursor += 13;
            }

            return pack('VVV', $cursor, count($properties), strlen($propertyBytes))
                . chr(strlen($name)) . $name . $propertyBytes . $childBytes
                . ($children !== [] ? str_repeat(chr(0), 13) : '');
        };
    }

    /** @param list<callable(int):string> $nodes */
    private function fbxDocument(array $nodes): string
    {
        // 20-character magic, its NUL, the 0x1A 0x00 pair, then the version.
        $document = 'Kaydara FBX Binary  ' . chr(0) . chr(0x1a) . chr(0) . pack('V', 7400);

        $cursor = strlen($document);
        foreach ($nodes as $node) {
            $bytes = $node($cursor);
            $document .= $bytes;
            $cursor += strlen($bytes);
        }

        return $document . str_repeat(chr(0), 13);
    }

    /** @param list<string> $paths */
    private function fbxDocumentWith(array $paths): string
    {
        $textures = [];
        foreach ($paths as $path) {
            $textures[] = $this->fbxNode('Texture', [], [
                $this->fbxNode('RelativeFilename', [$this->fbxStringProperty($path)], []),
            ]);
        }

        return $this->fbxDocument([$this->fbxNode('Objects', [], $textures)]);
    }

    /** @param list<string> $children */
    private function chunk(int $id, string $payload = '', array $children = []): string
    {
        $body = $payload . implode('', $children);

        return pack('v', $id) . pack('V', 6 + strlen($body)) . $body;
    }

    /** @param list<string> $mapChunks */
    private function threeDsDocument(array $mapChunks): string
    {
        return $this->chunk(0x4d4d, '', [
            $this->chunk(0x3d3d, '', [$this->chunk(0xafff, '', $mapChunks)]),
        ]);
    }

    /** @param list<string> $names */
    private function threeDsDocumentWith(array $names): string
    {
        $slots = [];
        foreach ($names as $name) {
            $slots[] = $this->chunk(0xa200, '', [$this->chunk(0xa300, $name . chr(0))]);
        }

        return $this->threeDsDocument($slots);
    }

    private function fileNamed(string $path, string $content = ''): File
    {
        $file = $this->createMock(File::class);
        $file->method('getName')->willReturn(basename($path));
        $file->method('getExtension')->willReturn(pathinfo($path, PATHINFO_EXTENSION));
        // A fresh handle per call, the way the real File does: the resolver reads the
        // OBJ once for its materials and each material once for its maps.
        $file->method('fopen')->willReturnCallback(
            static function () use ($content) {
                $handle = fopen('php://memory', 'r+');
                fwrite($handle, $content);
                rewind($handle);

                return $handle;
            }
        );

        return $file;
    }
}
