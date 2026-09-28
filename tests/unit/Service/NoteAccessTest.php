<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Service\NoteAccess;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotPermittedException;
use PHPUnit\Framework\TestCase;

class NoteAccessTest extends TestCase
{
    public function testNoNodeMeansNoAccess(): void
    {
        $this->assertNull($this->access([])->forUser(7, 'alice'));
    }

    public function testAFolderIsNotANoteTarget(): void
    {
        $this->assertNull($this->access([$this->createMock(Folder::class)])->forUser(7, 'alice'));
    }

    public function testReadOnlyFileGivesReadOnlyAccess(): void
    {
        $result = $this->access([$this->file(false)])->forUser(7, 'alice');

        $this->assertNotNull($result);
        $this->assertFalse($result->canEdit);
    }

    /** One file can be mounted twice — say a read-only share and the owner's own copy. */
    public function testAnyUpdateablePathGrantsEdit(): void
    {
        $result = $this->access([$this->file(false), $this->file(true)])->forUser(7, 'alice');

        $this->assertTrue($result?->canEdit);
    }

    public function testAnUnresolvableUserFolderMeansNoAccess(): void
    {
        $root = $this->createMock(IRootFolder::class);
        $root->method('getUserFolder')->willThrowException(new NotPermittedException());

        $this->assertNull((new NoteAccess($root))->forUser(7, 'alice'));
    }

    /** @param list<object> $nodes */
    private function access(array $nodes): NoteAccess
    {
        $home = $this->createMock(Folder::class);
        $home->method('getById')->with(7)->willReturn($nodes);
        $root = $this->createMock(IRootFolder::class);
        $root->method('getUserFolder')->with('alice')->willReturn($home);

        return new NoteAccess($root);
    }

    private function file(bool $updateable): File
    {
        $file = $this->createMock(File::class);
        $file->method('isUpdateable')->willReturn($updateable);

        return $file;
    }
}
