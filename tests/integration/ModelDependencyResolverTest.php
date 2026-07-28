<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Integration;

use OCA\ThreeDViewer\Service\ModelDependencyResolver;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\IUserManager;
use OCP\Server;
use PHPUnit\Framework\TestCase;

/**
 * The dependency route against real storage.
 *
 * The unit suite covers this class against mocked folders, which answer whatever the
 * test arranged. That is enough to check the parsing rules and nothing else: a mock
 * cannot show what `Folder::get()` does with `../`, what it does with a name that is not
 * there, or that reading a model through `File::fopen()` returns the bytes that were
 * written. Those are the parts that actually decide whether a public share leaks.
 *
 * Every file below is written into a real user's storage and read back through the
 * server's own file API.
 */
class ModelDependencyResolverTest extends TestCase
{
    private const PASSWORD = 'integration-suite-password-Aa1!';

    private string $uid;

    private ModelDependencyResolver $resolver;

    private Folder $models;

    protected function setUp(): void
    {
        $this->resolver = Server::get(ModelDependencyResolver::class);

        // A dedicated user per test, so a failure cannot leave state that changes the
        // next one, and so this never touches an existing account's files.
        $this->uid = 'tdv-it-' . bin2hex(random_bytes(6));
        Server::get(IUserManager::class)->createUser($this->uid, self::PASSWORD);

        $home = Server::get(IRootFolder::class)->getUserFolder($this->uid);
        $this->models = $home->newFolder('models');
    }

    protected function tearDown(): void
    {
        $user = Server::get(IUserManager::class)->get($this->uid);
        $user?->delete();
    }

    public function testResolvesATextureThroughRealStorage(): void
    {
        $this->models->newFile('chair.obj', "mtllib chair.mtl\nv 0 0 0\n");
        $this->models->newFile('chair.mtl', "newmtl seat\nmap_Kd wood.png\n");
        $texture = $this->models->newFile('wood.png', 'PNG');
        $model = $this->models->get('chair.obj');
        $this->assertInstanceOf(File::class, $model);

        $resolved = $this->resolver->resolve($model, 'wood.png');

        $this->assertSame($texture->getId(), $resolved->getId());
        $this->assertSame('PNG', $resolved->getContent());
    }

    public function testFollowsARealSubdirectory(): void
    {
        $this->models->newFile('chair.obj', "mtllib chair.mtl\n");
        $this->models->newFile('chair.mtl', "newmtl seat\nmap_Kd textures/wood.png\n");
        $textures = $this->models->newFolder('textures');
        $texture = $textures->newFile('wood.png', 'PNG');
        $model = $this->models->get('chair.obj');
        $this->assertInstanceOf(File::class, $model);

        $resolved = $this->resolver->resolve($model, 'wood.png');

        $this->assertSame($texture->getId(), $resolved->getId());
    }

    public function testRefusesASiblingThatExistsButIsNotDeclared(): void
    {
        $this->models->newFile('chair.obj', "mtllib chair.mtl\n");
        $this->models->newFile('chair.mtl', "newmtl seat\nmap_Kd wood.png\n");
        $this->models->newFile('wood.png', 'PNG');
        // Really present in the same folder, and really not referenced.
        $this->models->newFile('passport-scan.png', 'SECRET');
        $model = $this->models->get('chair.obj');
        $this->assertInstanceOf(File::class, $model);

        $this->expectException(NotFoundException::class);
        $this->resolver->resolve($model, 'passport-scan.png');
    }

    /**
     * The rule that keeps a single-file share from reaching the rest of the account.
     *
     * A mocked folder cannot demonstrate this: it returns whatever the test told it to
     * for any path, including one that climbs out.
     */
    public function testRefusesADeclaredPathThatClimbsOutOfTheModelsFolder(): void
    {
        $home = Server::get(IRootFolder::class)->getUserFolder($this->uid);
        $home->newFile('private.png', 'SECRET');

        $this->models->newFile('chair.obj', "mtllib chair.mtl\n");
        $this->models->newFile('chair.mtl', "newmtl seat\nmap_Kd ../private.png\n");
        $model = $this->models->get('chair.obj');
        $this->assertInstanceOf(File::class, $model);

        $this->expectException(NotFoundException::class);
        $this->resolver->resolve($model, 'private.png');
    }

    public function testRefusesADeclaredNameThatIsNotADependencyFormat(): void
    {
        $this->models->newFile('chair.obj', "mtllib evil.php\n");
        $this->models->newFile('evil.php', '<?php echo 1;');
        $model = $this->models->get('chair.obj');
        $this->assertInstanceOf(File::class, $model);

        $this->expectException(NotFoundException::class);
        $this->resolver->resolve($model, 'evil.php');
    }

    public function testResolvesABinaryFbxTextureThroughRealStorage(): void
    {
        $this->models->newFile('scene.fbx', $this->fbxDeclaring('textures/wood.png'));
        $textures = $this->models->newFolder('textures');
        $texture = $textures->newFile('wood.png', 'PNG');
        $model = $this->models->get('scene.fbx');
        $this->assertInstanceOf(File::class, $model);

        $resolved = $this->resolver->resolve($model, 'wood.png');

        $this->assertSame($texture->getId(), $resolved->getId());
    }

    public function testResolvesA3dsMapNameThroughRealStorage(): void
    {
        $this->models->newFile('scene.3ds', $this->threeDsDeclaring('wood.jpg'));
        $texture = $this->models->newFile('wood.jpg', 'JPG');
        $model = $this->models->get('scene.3ds');
        $this->assertInstanceOf(File::class, $model);

        $resolved = $this->resolver->resolve($model, 'wood.jpg');

        $this->assertSame($texture->getId(), $resolved->getId());
    }

    /**
     * Reading a model back is what the scanner actually does, and the stream a real
     * storage hands out is not the in-memory one the unit suite supplies.
     */
    public function testReadsTheModelThroughTheStorageStream(): void
    {
        $this->models->newFile('scene.fbx', $this->fbxDeclaring('wood.png'));
        $expected = $this->models->newFile('wood.png', 'PNG');
        $model = $this->models->get('scene.fbx');
        $this->assertInstanceOf(File::class, $model);

        $handle = $model->fopen('r');
        $this->assertIsResource($handle);
        $seekable = stream_get_meta_data($handle)['seekable'] ?? null;
        fclose($handle);

        // The scanner seeks when the stream allows it and falls back to a bounded read
        // when it does not. Both paths have to reach the same declaration, so this pins
        // the result against whichever one this storage actually hands out.
        $this->assertSame(
            $expected->getId(),
            $this->resolver->resolve($model, 'wood.png')->getId(),
            'texture did not resolve (stream seekable: ' . var_export($seekable, true) . ')',
        );
    }

    /** A minimal binary FBX whose only declaration is the given path. */
    private function fbxDeclaring(string $path): string
    {
        $header = 'Kaydara FBX Binary  ' . chr(0) . chr(0x1a) . chr(0) . pack('V', 7400);

        // Each record stores the absolute offset of its own end, so a nested one cannot
        // be built until the start of its parent's child list is known.
        $textureStart = strlen($header);
        $childStart = $textureStart + 13 + strlen('Texture');

        $property = 'S' . pack('V', strlen($path)) . $path;
        $inner = $this->fbxRecord('RelativeFilename', $property, 1, '', $childStart);
        $texture = $this->fbxRecord('Texture', '', 0, $inner, $textureStart);

        return $header . $texture . str_repeat(chr(0), 13);
    }

    private function fbxRecord(string $name, string $properties, int $count, string $children, int $start): string
    {
        $end = $start + 13 + strlen($name) + strlen($properties) + strlen($children);
        if ($children !== '') {
            $end += 13;
        }

        return pack('VVV', $end, $count, strlen($properties))
            . chr(strlen($name)) . $name . $properties . $children
            . ($children !== '' ? str_repeat(chr(0), 13) : '');
    }

    /** A minimal 3DS: main > editor > material > texture map > map name. */
    private function threeDsDeclaring(string $name): string
    {
        $chunk = static fn (int $id, string $body): string => pack('v', $id) . pack('V', 6 + strlen($body)) . $body;

        return $chunk(0x4d4d, $chunk(0x3d3d, $chunk(0xafff, $chunk(0xa200, $chunk(0xa300, $name . chr(0))))));
    }
}
