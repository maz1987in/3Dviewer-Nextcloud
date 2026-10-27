<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Service\ModelDependencyResolver;
use OCA\ThreeDViewer\Service\PathLocator;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\NotFoundException;
use PHPUnit\Framework\Attributes\DataProvider;
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

    public function testFindsEachImagesFileWhenOnlySomeImagesHaveOne(): void
    {
        $model = $this->modelNamed(
            'chair.dae',
            '<COLLADA><image id="a"></image><image id="b"><init_from>b.png</init_from></image><image id="c"/>'
            . '<image id="d"></image><image id="e"><init_from><ref>e.png</ref></init_from></image></COLLADA>',
            ['b.png' => $this->fileNamed('b.png'), 'e.png' => $this->fileNamed('e.png')],
        );

        $this->assertSame('b.png', $this->resolver->resolve($model, 'b.png')->getName());
        $this->assertSame('e.png', $this->resolver->resolve($model, 'e.png')->getName());
    }

    public function testDoesNotTakeAnEffectSurfaceImageIdForAFile(): void
    {
        // Blender, SketchUp and OpenCOLLADA write 1.4 like this: the effect's surface names
        // the <image> by id, and only the <image> names the file. An id that happens to look
        // like an image file sits beside the model here, so only the rule keeps it private.
        $model = $this->modelNamed(
            'chair.dae',
            '<COLLADA><library_images><image id="wood.png"><init_from>checker.png</init_from></image>'
            . '</library_images><library_effects><effect id="fx"><profile_COMMON>'
            . '<newparam sid="surf"><surface type="2D"><init_from>wood.png</init_from></surface></newparam>'
            . '</profile_COMMON></effect></library_effects></COLLADA>',
            ['checker.png' => $this->fileNamed('checker.png'), 'wood.png' => $this->fileNamed('wood.png')],
        );

        $this->assertSame('checker.png', $this->resolver->resolve($model, 'checker.png')->getName());
        $this->expectException(NotFoundException::class);
        $this->resolver->resolve($model, 'wood.png');
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

    public function testServesOnlyWhatAnX3dImageTextureNames(): void
    {
        // An Anchor, Inline, AudioClip or Script url names no texture, so it is no
        // dependency, even when a file of that name sits beside the model
        $texture = $this->fileNamed('wood grain.png');
        $model = $this->modelNamed(
            'chair.x3d',
            '<X3D><Scene><Inline url=\'"room.png"\'/><AudioClip url=\'"hum.png"\'/>'
            . '<ImageTexture3D url=\'"volume.png"\'/>'
            . '<ImageTexture DEF="W" url="&quot;wood grain.png&quot;"/></Scene></X3D>',
            [
                'wood grain.png' => $texture,
                'room.png' => $this->fileNamed('room.png'),
                'hum.png' => $this->fileNamed('hum.png'),
                'volume.png' => $this->fileNamed('volume.png'),
            ],
        );

        $this->assertSame($texture, $this->resolver->resolve($model, 'wood grain.png'));
        foreach (['room.png', 'hum.png', 'volume.png'] as $name) {
            try {
                $this->resolver->resolve($model, $name);
                $this->fail("{$name} should not be servable");
            } catch (NotFoundException) {
                // Not declared by an ImageTexture
            }
        }
    }

    /**
     * Uploads crafted so that a pattern running from each tag start to the end of the
     * document would be quadratic. Each is scanned once, forward; mirrors the linear-time
     * tests in tests/unit/loaders/xmlModelDependencies.test.js.
     *
     * @return array<string, array{string, string}>
     */
    public static function craftedXmlDocuments(): array
    {
        return [
            'unclosed <ImageTexture starts' => ['chair.x3d', str_repeat('<ImageTexture ', 200000)],
            'one huge unterminated quoted value' => ['chair.x3d', '<ImageTexture url="' . str_repeat('<ImageTexture ', 200000)],
            'unterminated values in one closed tag' => ['chair.x3d', '<ImageTexture ' . str_repeat('a="', 300000) . '>'],
            '<init_from without >' => ['chair.dae', '<image>' . str_repeat('<init_from ', 200000) . '</image>'],
            '<image without >' => ['chair.dae', str_repeat('<image ', 300000)],
            'unclosed <image> blocks' => ['chair.dae', str_repeat('<image><init_from>a.png</init_from>', 60000)],
            'a million empty <image> blocks' => ['chair.dae', str_repeat('<image></image>', 1000000)],
        ];
    }

    #[DataProvider('craftedXmlDocuments')]
    public function testScansACraftedXmlDocumentInLinearTime(string $name, string $content): void
    {
        $model = $this->modelNamed($name, $content, ['a.png' => $this->fileNamed('a.png')]);

        $started = microtime(true);

        try {
            $this->resolver->resolve($model, 'wood.png');
            $this->fail('Nothing named wood.png is declared');
        } catch (NotFoundException) {
            // Expected: the point is how long it took
        }

        $this->assertLessThan(1.0, microtime(true) - $started);
    }

    public function testReadsAnMtllibLineWithALongRunOfBlanksInLinearTime(): void
    {
        // A lazy value followed by optional trailing blanks retried the blank run once per
        // character of the value
        $material = $this->fileNamed('chair.mtl', "newmtl seat\nmap_Kd wood.png\n");
        $model = $this->modelNamed(
            'chair.obj',
            'mtllib chair.mtl' . str_repeat(' ', 500000) . "x\nf 1 2 3\n",
            ['chair.mtl' => $material, 'wood.png' => $this->fileNamed('wood.png')],
        );

        $started = microtime(true);

        try {
            $this->resolver->resolve($model, 'wood.png');
        } catch (NotFoundException) {
            // The odd line names "chair.mtl   …   x"; only the timing is under test
        }

        $this->assertLessThan(1.0, microtime(true) - $started);
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

    /**
     * The directories of an absolute path are on the author's machine. Followed inside
     * the model's folder they would let a declaration pick any subfolder, so only the
     * name is used, and only beside the model.
     */
    public function testServesAnAbsoluteFbxTexturePathOnlyByItsNameBesideTheModel(): void
    {
        $model = $this->modelNamed(
            'scene.fbx',
            $this->fbxDocumentWith(['C:\\Users\\someone\\wood.png']),
            ['C:/Users/someone/wood.png' => $this->fileNamed('wood.png')],
        );

        $this->expectException(NotFoundException::class);
        $this->resolver->resolve($model, 'wood.png');
    }

    /**
     * The table tests/unit/loaders/textureReferences.test.js holds the client to, read
     * through both binary formats, whose declarations reach normalise() as written.
     *
     * @return array<string, array{string, string, ?string}>
     */
    public static function sharedReferenceTable(): array
    {
        /** @var array{cases: list<array{ref: string, expected: ?string, why: string}>} $table */
        $table = json_decode(
            (string) file_get_contents(__DIR__ . '/../../fixtures/texture-references.json'),
            true,
            flags: JSON_THROW_ON_ERROR,
        );

        $cases = [];
        foreach ($table['cases'] as $case) {
            foreach (['fbx', '3ds'] as $format) {
                // A 3DS map name ends at its first NUL, so it cannot carry one
                if ($format === '3ds' && str_contains($case['ref'], "\0")) {
                    continue;
                }
                $cases[$format . ': ' . $case['why'] . ': ' . json_encode($case['ref'])] = [$format, $case['ref'], $case['expected']];
            }
        }

        return $cases;
    }

    #[DataProvider('sharedReferenceTable')]
    public function testNormalisesAReferenceAsTheClientDoes(string $format, string $ref, ?string $expected): void
    {
        $folded = ltrim(str_replace('\\', '/', trim($ref)), '/');
        $document = $format === 'fbx' ? $this->fbxDocumentWith([$ref]) : $this->threeDsDocumentWith([$ref]);

        if ($expected !== null) {
            $texture = $this->fileNamed($expected);
            // A different file where the reference's own directories lead, so serving
            // that one instead would fail the assertion rather than pass by accident
            $siblings = [$expected => $texture];
            if ($folded !== $expected) {
                $siblings[$folded] = $this->fileNamed(basename($expected));
            }
            $model = $this->modelNamed('scene.' . $format, $document, $siblings);

            $this->assertSame($texture, $this->resolver->resolve($model, basename($expected)));

            return;
        }

        // Rejected: whatever name a client might ask for is refused, even with a file of
        // that name beside the model
        $slash = strrpos($folded, '/');
        $last = $slash === false ? $folded : substr($folded, $slash + 1);
        $names = array_unique(array_filter(
            ['wood.jpg', $last, rawurldecode($last)],
            static fn (string $name): bool => $name !== '' && $name !== '.' && $name !== '..' && strpbrk($name, "/\\\0") === false,
        ));
        $siblings = [];
        foreach ($names as $name) {
            $siblings[$name] = $this->fileNamed($name);
        }
        if ($folded !== '') {
            $siblings[$folded] = $this->fileNamed(basename($folded));
        }
        $model = $this->modelNamed('scene.' . $format, $document, $siblings);

        foreach ($names as $name) {
            try {
                $this->resolver->resolve($model, $name);
                $this->fail(sprintf('%s should not make %s servable', json_encode($ref), $name));
            } catch (NotFoundException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    /**
     * A reference is a string the uploader chose. Every check on it is a fixed-length
     * test at its start or a single forward scan; mirrors the linear-time cases in
     * tests/unit/loaders/textureReferences.test.js.
     *
     * @return array<string, array{string, string}>
     */
    public static function craftedReferences(): array
    {
        return [
            'a run of backslashes after a drive letter' => ['C:' . str_repeat('\\', 1000000) . 'wood.jpg', 'wood.jpg'],
            'a run of slashes' => [str_repeat('/', 1000000) . 'wood.jpg', 'wood.jpg'],
            'a file: URL of stray percent signs' => ['file:///' . str_repeat('%', 1000000) . '.png', str_repeat('%', 1000000) . '.png'],
            'a file: URL of escapes' => ['file:///' . str_repeat('%41', 300000) . '.png', str_repeat('A', 300000) . '.png'],
            'a file: URL of query marks' => ['file:///wood.jpg' . str_repeat('?', 1000000), 'wood.jpg'],
        ];
    }

    #[DataProvider('craftedReferences')]
    public function testReducesACraftedReferenceInLinearTime(string $ref, string $name): void
    {
        $texture = $this->fileNamed($name);
        $model = $this->modelNamed('scene.fbx', $this->fbxDocumentWith([$ref]), [$name => $texture]);

        $started = microtime(true);

        $this->assertSame($texture, $this->resolver->resolve($model, $name));
        $this->assertLessThan(1.0, microtime(true) - $started);
    }

    public function testServesAColladaImageNamedByAWindowsPathFromBesideTheModel(): void
    {
        $texture = $this->fileNamed('wood.jpg');
        $model = $this->modelNamed(
            'room.dae',
            '<COLLADA><library_images>'
            . '<image id="a"><init_from>C:\\Users\\anna\\Desktop\\textures\\wood.jpg</init_from></image>'
            . '</library_images></COLLADA>',
            ['wood.jpg' => $texture],
        );

        $this->assertSame($texture, $this->resolver->resolve($model, 'wood.jpg'));
    }

    /**
     * A name an absolute path fell back to is served from the model's folder alone. The
     * folder mock answers get() by whole path, so a subfolder holding the name would
     * only be reached by a lookup that went looking in it.
     */
    public function testNeverServesANameOnlyEntryFromASubfolder(): void
    {
        $model = $this->modelNamed(
            'room.dae',
            '<COLLADA><library_images><image><init_from>/home/anna/textures/wood.jpg</init_from></image></library_images></COLLADA>',
            [
                'textures/wood.jpg' => $this->fileNamed('wood.jpg'),
                'home/anna/textures/wood.jpg' => $this->fileNamed('wood.jpg'),
            ],
        );

        $this->expectException(NotFoundException::class);
        $this->resolver->resolve($model, 'wood.jpg');
    }

    public function testDecodesAPercentEncodedFileUrlOnce(): void
    {
        $grain = $this->fileNamed('wood grain.jpg');
        $literal = $this->fileNamed('100%20.png');
        $model = $this->modelNamed(
            'room.dae',
            '<COLLADA><library_images>'
            . '<image><init_from>file:///C:/My%20Textures/wood%20grain.jpg</init_from></image>'
            . '<image><init_from>file:///C:/x/100%2520.png</init_from></image>'
            . '</library_images></COLLADA>',
            ['wood grain.jpg' => $grain, '100%20.png' => $literal, '100 .png' => $this->fileNamed('100 .png')],
        );

        $this->assertSame($grain, $this->resolver->resolve($model, 'wood grain.jpg'));
        $this->assertSame($literal, $this->resolver->resolve($model, '100%20.png'));
    }

    public function testServesAnX3dUrlNamedByAFileUrlFromBesideTheModel(): void
    {
        $texture = $this->fileNamed('checker.png');
        $model = $this->modelNamed(
            'wall.x3d',
            '<X3D><Scene><ImageTexture url=\'"file:///C:/x/checker.png" "https://example.invalid/checker.png"\'/></Scene></X3D>',
            ['checker.png' => $texture],
        );

        $this->assertSame($texture, $this->resolver->resolve($model, 'checker.png'));
    }

    /**
     * An absolute map in a material that lives in a subfolder still names a place on
     * the author's machine, not one below the material: by name, beside the model.
     */
    public function testServesAnAbsoluteMapOfASubfolderMaterialFromBesideTheModel(): void
    {
        $texture = $this->fileNamed('wood.png');
        $model = $this->objModel(
            "mtllib mats/chair.mtl\n",
            [
                'mats/chair.mtl' => $this->fileNamed('chair.mtl', "map_Kd C:\\textures\\wood.png\n"),
                'wood.png' => $texture,
                'mats/wood.png' => $this->fileNamed('wood.png'),
                'mats/C:/textures/wood.png' => $this->fileNamed('wood.png'),
            ],
        );

        $this->assertSame($texture, $this->resolver->resolve($model, 'wood.png'));
    }

    public function testRefusesARemoteMapOfASubfolderMaterial(): void
    {
        // Prefixed with the material's folder before the scheme was checked, this read as
        // the relative path mats/https:/example.invalid/wood.png
        $model = $this->objModel(
            "mtllib mats/chair.mtl\n",
            [
                'mats/chair.mtl' => $this->fileNamed('chair.mtl', "map_Kd https://example.invalid/wood.png\n"),
                'mats/https:/example.invalid/wood.png' => $this->fileNamed('wood.png'),
            ],
        );

        $this->expectException(NotFoundException::class);
        $this->resolver->resolve($model, 'wood.png');
    }

    public function testServesAnAbsoluteMtllibByItsNameBesideTheModel(): void
    {
        $texture = $this->fileNamed('wood.png');
        $model = $this->objModel(
            "mtllib D:\\exports\\chair.mtl\n",
            [
                'chair.mtl' => $this->fileNamed('chair.mtl', "map_Kd wood.png\n"),
                'wood.png' => $texture,
            ],
        );

        $this->assertSame($texture, $this->resolver->resolve($model, 'wood.png'));
    }

    /**
     * Both declarations key the same name. Whichever comes first is what the name
     * serves, so a later one, absolute or relative, cannot redirect it.
     */
    public function testTheFirstDeclarationOfANameWinsBetweenAbsoluteAndRelative(): void
    {
        $beside = $this->fileNamed('wood.png');
        $below = $this->fileNamed('wood.png');
        $siblings = ['wood.png' => $beside, 'textures/wood.png' => $below];

        $relativeFirst = $this->modelNamed(
            'scene.fbx',
            $this->fbxDocumentWith(['textures/wood.png', 'C:\\export\\wood.png']),
            $siblings,
        );
        $absoluteFirst = $this->modelNamed(
            'scene.fbx',
            $this->fbxDocumentWith(['C:\\export\\wood.png', 'textures/wood.png']),
            $siblings,
        );

        $this->assertSame($below, $this->resolver->resolve($relativeFirst, 'wood.png'));
        $this->assertSame($beside, $this->resolver->resolve($absoluteFirst, 'wood.png'));
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
