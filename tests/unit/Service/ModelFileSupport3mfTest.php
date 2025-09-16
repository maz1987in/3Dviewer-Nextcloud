<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Service\ModelFileSupport;
use PHPUnit\Framework\TestCase;

class ModelFileSupport3mfTest extends TestCase {
	public function testThreeMfIsSupported(): void {
		$support = new ModelFileSupport();
		$this->assertContains('3mf', $support->getSupportedExtensions());
		$this->assertTrue($support->isSupported('3mf'));
		$this->assertSame('model/3mf', $support->mapContentType('3mf'));
	}
}
