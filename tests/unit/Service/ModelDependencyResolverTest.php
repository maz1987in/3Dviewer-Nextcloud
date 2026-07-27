<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Service\ModelDependencyResolver;
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
        $this->resolver = new ModelDependencyResolver();
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

        $lookups = 0;
        $folder = $this->createMock(Folder::class);
        $folder->method('get')->willReturnCallback(
            static function (string $path) use (&$lookups): File {
                $lookups++;

                throw new NotFoundException('no node at ' . $path);
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
            $lookups,
            "scanned {$lookups} materials for a model declaring {$declared}"
        );
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
