<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Service\ModelFileSupport;
use PHPUnit\Framework\TestCase;

class ModelFileSupport3dsTest extends TestCase {
	public function testThreeDsIsSupported(): void {
		$support = new ModelFileSupport();
		$this->assertContains('3ds', $support->getSupportedExtensions());
		$this->assertTrue($support->isSupported('3ds'));
		$this->assertSame('application/octet-stream', $support->mapContentType('3ds'));
	}
}
