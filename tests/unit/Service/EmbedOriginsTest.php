<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Service\EmbedOrigins;
use OCA\ThreeDViewer\Service\Exception\InvalidEmbedOriginException;
use OCP\IAppConfig;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class EmbedOriginsTest extends TestCase
{
    private IAppConfig&MockObject $config;
    /** @var array<string, mixed> */
    private array $stored = [];
    private EmbedOrigins $origins;

    protected function setUp(): void
    {
        $this->config = $this->createMock(IAppConfig::class);
        $this->config->method('getValueArray')->willReturnCallback(
            fn (string $app, string $key, array $default = []) => $this->stored[$app . '/' . $key] ?? $default,
        );
        $this->config->method('setValueArray')->willReturnCallback(function (string $app, string $key, array $value): bool {
            $this->stored[$app . '/' . $key] = $value;

            return true;
        });
        $this->origins = new EmbedOrigins($this->config);
    }

    /** @return array<string, array{string, string}> */
    public static function origins(): array
    {
        return [
            'capitals and a trailing slash' => ['https://Shop.Example.com/', 'https://shop.example.com'],
            'the default https port' => ['HTTPS://shop.example.com:443', 'https://shop.example.com'],
            'another port' => ['https://shop.example.com:8443', 'https://shop.example.com:8443'],
            'spaces around it' => ['  https://a.example  ', 'https://a.example'],
            'localhost over http' => ['http://localhost:5173', 'http://localhost:5173'],
            'the loopback address' => ['http://127.0.0.1:8080', 'http://127.0.0.1:8080'],
            'an internationalised name' => ['https://xn--bcher-kva.example', 'https://xn--bcher-kva.example'],
        ];
    }

    #[DataProvider('origins')]
    public function testNormalisesAnOrigin(string $input, string $expected): void
    {
        $this->assertSame($expected, EmbedOrigins::normalize($input));
    }

    /** @return array<string, array{string}> */
    public static function notOrigins(): array
    {
        return [
            'http to a real host' => ['http://shop.example.com'],
            'another scheme' => ['ftp://a.example'],
            'no host' => ['https://'],
            'a wildcard' => ['*'],
            'a wildcard host' => ['https://*.example.com'],
            'a path' => ['https://a.example/path'],
            'a query' => ['https://a.example?q=1'],
            'a fragment' => ['https://a.example#x'],
            'a user' => ['https://user@a.example'],
            'another directive' => ['https://a.example; script-src *'],
            'a space' => ['https://a .example'],
            'a keyword' => ["'self'"],
            'a quote' => ["https://a.example'"],
            'a backslash' => ['https://a\\b.example'],
            'a script' => ['javascript:alert(1)'],
            'a bare host' => ['localhost'],
            // CSP's host-source has no form for an IPv6 address: browsers drop it unused
            'the IPv6 loopback' => ['http://[::1]:3000'],
            'an IPv6 address' => ['https://[2001:db8::1]'],
            'nothing' => [''],
        ];
    }

    #[DataProvider('notOrigins')]
    public function testRefusesWhatIsNotAnOrigin(string $input): void
    {
        $this->assertNull(EmbedOrigins::normalize($input));
    }

    public function testSaveStoresTheCleanListInOrderWithoutDuplicates(): void
    {
        $saved = $this->origins->save(['https://b.example', 'https://A.example/', 'https://b.example', '']);

        $this->assertSame(['https://b.example', 'https://a.example'], $saved);
        $this->assertSame(['https://b.example', 'https://a.example'], $this->origins->list());
        $this->assertTrue($this->origins->isEnabled());
    }

    public function testSaveRefusesTheWholeListWhenAnEntryIsBad(): void
    {
        $this->origins->save(['https://kept.example']);

        try {
            $this->origins->save(['https://a.example', 'http://shop.example.com']);
            $this->fail('a bad entry must be refused');
        } catch (InvalidEmbedOriginException $e) {
            $this->assertSame(['http://shop.example.com'], $e->getInvalid());
        }
        $this->assertSame(['https://kept.example'], $this->origins->list(), 'nothing of the refused list is stored');
    }

    public function testAnEmptyListTurnsEmbeddingOff(): void
    {
        $this->origins->save(['https://a.example']);

        $this->assertSame([], $this->origins->save([]));
        $this->assertSame([], $this->origins->list());
        $this->assertFalse($this->origins->isEnabled());
    }

    public function testEmbeddingIsOffByDefault(): void
    {
        $this->assertSame([], $this->origins->list());
        $this->assertFalse($this->origins->isEnabled());
    }

    /** @return array<string, array{mixed}> */
    public static function notLists(): array
    {
        return [
            'a string' => ['https://a.example'],
            'a number in the list' => [[1]],
            'null' => [null],
        ];
    }

    #[DataProvider('notLists')]
    public function testSaveRefusesWhatIsNotAListOfStrings(mixed $input): void
    {
        $this->config->expects($this->never())->method('setValueArray');
        $this->expectException(InvalidEmbedOriginException::class);

        $this->origins->save($input);
    }

    public function testAStoredValueThatIsNotACleanOriginNeverComesOut(): void
    {
        $this->stored['threedviewer/' . EmbedOrigins::CONFIG_KEY] = ['https://a.example', 'https://b.example; script-src *', 7];

        $this->assertSame(['https://a.example'], $this->origins->list());
    }
}
