<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Controller;

use OCA\ThreeDViewer\Controller\ConfigController;
use OCP\IConfig;
use OCP\IRequest;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class ConfigControllerTest extends TestCase
{
    /** @var IConfig&MockObject */
    private $config;

    protected function setUp(): void
    {
        $this->config = $this->createMock(IConfig::class);
    }

    public function testStoresTheSortTheViewerSends(): void
    {
        foreach (['viewer', 'folders', 'type', 'date', 'favorites'] as $mode) {
            $config = $this->createMock(IConfig::class);
            $config->expects($this->once())->method('setUserValue')->with('alice', 'threedviewer', 'file_sort', $mode);

            $response = $this->controller($config)->setConfig(['file_sort' => $mode]);

            $this->assertSame(200, $response->getStatus());
            $this->assertSame([], $response->getData());
        }
    }

    public function testStoresTheSelectedFileIdTheViewerSendsAsAString(): void
    {
        $this->config->expects($this->once())->method('setUserValue')->with('alice', 'threedviewer', 'selected_file_id', '1234');

        $response = $this->controller()->setConfig(['selected_file_id' => '1234']);

        $this->assertSame(200, $response->getStatus());
        $this->assertSame([], $response->getData());
    }

    public function testAcceptsAnIntegerIdAndZero(): void
    {
        $stored = [];
        $this->config->method('setUserValue')->willReturnCallback(function (string $u, string $app, string $key, string $value) use (&$stored): void {
            $stored[] = [$key, $value];
        });

        $this->assertSame(200, $this->controller()->setConfig(['selected_file_id' => 42])->getStatus());
        $this->assertSame(200, $this->controller()->setConfig(['selected_file_id' => '0'])->getStatus());
        $this->assertSame([['selected_file_id', '42'], ['selected_file_id', '0']], $stored);
    }

    public function testStoresBothSettingsInOneRequest(): void
    {
        $this->config->expects($this->exactly(2))->method('setUserValue');

        $response = $this->controller()->setConfig(['file_sort' => 'type', 'selected_file_id' => '7']);

        $this->assertSame(200, $response->getStatus());
    }

    public function testAnUnknownKeyIsRefusedAndNothingIsStored(): void
    {
        $this->config->expects($this->never())->method('setUserValue');

        $response = $this->controller()->setConfig(['user_preferences' => '{}']);

        $this->assertSame(400, $response->getStatus());
        $this->assertSame(['error' => 'Unknown setting'], $response->getData());
    }

    public function testOneBadKeyRefusesTheValidOnesBesideIt(): void
    {
        $this->config->expects($this->never())->method('setUserValue');

        $first = $this->controller()->setConfig(['file_sort' => 'type', 'other' => 'x']);
        $second = $this->controller()->setConfig(['other' => 'x', 'file_sort' => 'type']);

        $this->assertSame(400, $first->getStatus());
        $this->assertSame(400, $second->getStatus());
    }

    public function testAListInsteadOfNamedSettingsIsRefused(): void
    {
        $this->config->expects($this->never())->method('setUserValue');

        $this->assertSame(400, $this->controller()->setConfig(['folders'])->getStatus());
    }

    #[DataProvider('badSorts')]
    public function testABadSortIsRefusedAndNothingIsStored(mixed $value): void
    {
        $this->config->expects($this->never())->method('setUserValue');

        $response = $this->controller()->setConfig(['file_sort' => $value]);

        $this->assertSame(400, $response->getStatus());
        $this->assertSame(['error' => 'Invalid value for file_sort'], $response->getData());
    }

    /** @return array<string, array{mixed}> */
    public static function badSorts(): array
    {
        return [
            'unknown mode' => ['alphabetical'],
            'wrong case' => ['Folders'],
            'padded' => [' folders'],
            'empty' => [''],
            'null' => [null],
            'number' => [1],
            'array' => [['folders']],
            'oversized' => [str_repeat('folders', 10000)],
        ];
    }

    #[DataProvider('badIds')]
    public function testABadFileIdIsRefusedAndNothingIsStored(mixed $value): void
    {
        $this->config->expects($this->never())->method('setUserValue');

        $response = $this->controller()->setConfig(['selected_file_id' => $value]);

        $this->assertSame(400, $response->getStatus());
        $this->assertSame(['error' => 'Invalid value for selected_file_id'], $response->getData());
    }

    /** @return array<string, array{mixed}> */
    public static function badIds(): array
    {
        return [
            'negative string' => ['-1'],
            'negative int' => [-1],
            'text' => ['abc'],
            'empty' => [''],
            'decimal' => ['1.5'],
            'float' => [1.5],
            'exponent' => ['1e3'],
            'hex' => ['0x10'],
            'padded' => [' 5'],
            'trailing newline' => ["5\n"],
            'null' => [null],
            'bool' => [true],
            'array' => [['5']],
            'nested array' => [[['5']]],
            'oversized' => [str_repeat('9', 10000)],
        ];
    }

    public function testAnonymousCallersAreRefusedBeforeAnythingIsChecked(): void
    {
        $this->config->expects($this->never())->method('setUserValue');

        $controller = new ConfigController('threedviewer', $this->createMock(IRequest::class), $this->config, null);

        $this->assertSame(401, $controller->setConfig(['file_sort' => 'type'])->getStatus());
    }

    private function controller(?IConfig $config = null): ConfigController
    {
        return new ConfigController('threedviewer', $this->createMock(IRequest::class), $config ?? $this->config, 'alice');
    }
}
