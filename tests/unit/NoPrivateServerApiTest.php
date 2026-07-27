<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit;

use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use SplFileInfo;

/**
 * Guards against reaching into Nextcloud's private server internals.
 *
 * Apps may only use the `OCP\` public API. The private `\OC` container and the
 * legacy `OC_*` static classes carry no compatibility promise and get pruned
 * between releases — NC 34 dropped `\OC\Server::getDatabaseConnection()`, which
 * fataled the app's upgrade migration (issue #116).
 *
 * Static analysis cannot catch this for us: `composer.json` pins `nextcloud/ocp`
 * to an older branch, so psalm still sees the removed methods as valid. Scanning
 * our own source is the only check that stays honest about it.
 */
class NoPrivateServerApiTest extends TestCase
{
    /** @return array<string, array{0: string}> */
    public static function phpSourceFilesProvider(): array
    {
        $libDir = realpath(__DIR__ . '/../../lib');
        self::assertIsString($libDir, 'lib/ directory must exist');

        $files = [];
        $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($libDir));
        /** @var SplFileInfo $file */
        foreach ($iterator as $file) {
            if ($file->isFile() && $file->getExtension() === 'php') {
                $relative = 'lib/' . ltrim(str_replace($libDir, '', $file->getPathname()), '/');
                $files[$relative] = [$file->getPathname()];
            }
        }

        self::assertNotEmpty($files, 'Expected to find PHP sources under lib/');

        return $files;
    }

    /**
     * @dataProvider phpSourceFilesProvider
     */
    public function testDoesNotUsePrivateServerContainer(string $path): void
    {
        $code = $this->stripComments($path);

        $this->assertDoesNotMatchRegularExpression(
            '/(?<![A-Za-z0-9_\\\\])\\\\?OC::\$server\b/',
            $code,
            'Use OCP\Server::get() or constructor injection instead of the private \OC container'
        );

        $this->assertDoesNotMatchRegularExpression(
            '/(?<![A-Za-z0-9_\\\\])\\\\?OC_[A-Za-z]/',
            $code,
            'Legacy OC_* static classes are private API and may be removed without notice'
        );
    }

    /**
     * Returns the file's source with comments removed, so that documentation
     * *about* a removed API is not mistaken for a call to it.
     */
    private function stripComments(string $path): string
    {
        $source = file_get_contents($path);
        self::assertIsString($source, "Could not read {$path}");

        $out = '';
        foreach (token_get_all($source) as $token) {
            if (is_array($token)) {
                if ($token[0] === T_COMMENT || $token[0] === T_DOC_COMMENT) {
                    continue;
                }
                $out .= $token[1];
                continue;
            }
            $out .= $token;
        }

        return $out;
    }
}
