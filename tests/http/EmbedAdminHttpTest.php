<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Http;

require_once __DIR__ . '/HttpTestCase.php';

/**
 * The sites allowed to embed, through the real middleware: only an admin saves them.
 */
class EmbedAdminHttpTest extends HttpTestCase
{
    /** @var list<string> */
    private array $before = [];

    protected function setUp(): void
    {
        $this->before = self::storedEmbedOrigins();
    }

    protected function tearDown(): void
    {
        $this->setEmbedOrigins($this->before);
        parent::tearDown();
    }

    public function testAnAdminSavesTheList(): void
    {
        $admin = $this->newAdmin();

        $response = $this->basic($admin)->put(self::EMBED_ADMIN_URL, ['json' => ['origins' => ['https://Shop.Example/', 'http://localhost:5173']]]);

        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame(['origins' => ['https://shop.example', 'http://localhost:5173']], self::json($response));
        $this->assertSame(['https://shop.example', 'http://localhost:5173'], self::storedEmbedOrigins());
    }

    public function testABadEntryIsRefusedAndNamed(): void
    {
        $this->setEmbedOrigins(['https://kept.example']);

        $response = $this->basic($this->newAdmin())->put(self::EMBED_ADMIN_URL, ['json' => ['origins' => ['https://a.example', 'http://shop.example.com']]]);

        $this->assertSame(400, $response->getStatusCode());
        $this->assertSame(['http://shop.example.com'], self::json($response)['invalid'] ?? null);
        $this->assertSame(['https://kept.example'], self::storedEmbedOrigins());
    }

    public function testAUserWhoIsNotAnAdminCannotSave(): void
    {
        $this->setEmbedOrigins(['https://kept.example']);

        $response = $this->basic($this->newUser())->put(self::EMBED_ADMIN_URL, ['json' => ['origins' => ['https://evil.example']]]);

        $this->assertSame(403, $response->getStatusCode());
        $this->assertSame(['https://kept.example'], self::storedEmbedOrigins());
    }
}
